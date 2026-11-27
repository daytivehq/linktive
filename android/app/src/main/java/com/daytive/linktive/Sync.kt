package com.daytive.linktive

import android.app.Application
import android.content.Context
import androidx.room.Room
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import org.json.JSONException

class LinktiveApplication : Application() {
    val library by lazy { LibraryRepository(this) }
}

enum class SyncState { Idle, Syncing, Synced, ServerUnavailable, Reconnect }

class LibraryRepository(private val context: Context) {
    private val database = Room.databaseBuilder(context, LibraryDatabase::class.java, "linktive.db").build()
    private val dao = database.library()
    private val savedConnection = ConnectionStore(context)
    val connection = savedConnection.current
    val spaces = dao.observeSpaces()
    val bookmarks = dao.observeBookmarks()
    val pending = dao.observePending()
    private val mutableSyncState = MutableStateFlow(SyncState.Idle)
    val syncState = mutableSyncState.asStateFlow()
    private val changes = Mutex()

    private val http = OkHttpClient.Builder()
        .followRedirects(false)
        .callTimeout(35, TimeUnit.SECONDS)
        .build()

    suspend fun connect(rawUrl: String, rawKey: String) = withContext(Dispatchers.IO) {
        val base = parseServerAddress(rawUrl, BuildConfig.DEBUG)
            ?: throw IllegalArgumentException("올바른 HTTPS 서버 주소를 입력하세요.")
        val key = rawKey.trim()
        require(Regex("lkt_[A-Za-z0-9_-]+").matches(key)) { "linktive API 키를 입력하세요." }
        val serverUrl = base.toString().trimEnd('/')
        changes.withLock {
            val previous = connection.value
            require(previous == null || previous.serverUrl == serverUrl) {
                "이 앱에 연결된 서버 주소를 입력하세요."
            }
            val profile = Server(base, key, http).profile()
            require(previous == null || previous.userId == profile.userId) {
                "기존 linktive 계정에서 발급한 키를 입력하세요."
            }
            val initial = profile.spaces.firstOrNull { it.id == profile.defaultSpace && it.writable }
                ?: profile.spaces.firstOrNull { it.role == "owner" }
                ?: profile.spaces.firstOrNull { it.writable }
            val default = previous?.defaultSpaceId ?: initial?.id
            savedConnection.save(Connection(serverUrl, profile.userId, default), key)
            dao.replaceSpaces(profile.spaces)
            if (default != null) dao.assignUnassigned(default)
        }
        schedulePeriodicSync(context)
        scheduleSync(context, ExistingWorkPolicy.REPLACE)
    }

    suspend fun setDefaultSpace(id: String) = withContext(Dispatchers.IO) {
        changes.withLock {
            require(spaces.first().any { it.id == id && it.writable })
            savedConnection.setDefaultSpace(id)
            dao.assignUnassigned(id)
        }
        scheduleSync(context, ExistingWorkPolicy.KEEP)
    }

    suspend fun queue(link: SharedLink, requestId: String): Boolean = withContext(Dispatchers.IO) {
        val default = connection.value?.defaultSpaceId
        dao.queue(PendingShare(requestId, default, link.url, link.title, System.currentTimeMillis()))
        schedulePeriodicSync(context)
        scheduleSync(context, ExistingWorkPolicy.APPEND_OR_REPLACE)
        default != null
    }

    suspend fun changePendingSpace(id: String, spaceId: String) = withContext(Dispatchers.IO) {
        changes.withLock {
            require(spaces.first().any { it.id == spaceId && it.writable })
            dao.retarget(id, spaceId, UUID.randomUUID().toString())
        }
        scheduleSync(context, ExistingWorkPolicy.REPLACE)
    }

    suspend fun dismissPending(id: String) = withContext(Dispatchers.IO) {
        changes.withLock { dao.removePending(id) }
    }

    suspend fun synchronize(): Boolean = withContext(Dispatchers.IO) {
        changes.withLock {
            val config = connection.value ?: return@withLock true
            val base = parseServerAddress(config.serverUrl, BuildConfig.DEBUG) ?: return@withLock true
            val key = savedConnection.apiKey()
            if (key == null) {
                mutableSyncState.value = SyncState.Reconnect
                return@withLock true
            }
            mutableSyncState.value = SyncState.Syncing
            try {
                val server = Server(base, key, http)
                val profile = server.profile()
                if (profile.userId != config.userId) {
                    mutableSyncState.value = SyncState.Reconnect
                    return@withLock true
                }
                dao.replaceSpaces(profile.spaces)
                pushPending(server, profile.spaces, config.defaultSpaceId)
                for (space in profile.spaces) {
                    try {
                        dao.replaceBookmarks(space.id, downloadBookmarks(server, space.id))
                    } catch (error: ServerFailure) {
                        if (error.status !in listOf(403, 404)) throw error
                        dao.clearBookmarks(space.id)
                    }
                }
                mutableSyncState.value = SyncState.Synced
                true
            } catch (error: ServerFailure) {
                if (error.status == 401) {
                    mutableSyncState.value = SyncState.Reconnect
                    true
                } else {
                    mutableSyncState.value = SyncState.ServerUnavailable
                    false
                }
            } catch (_: IOException) {
                mutableSyncState.value = SyncState.ServerUnavailable
                false
            } catch (_: JSONException) {
                mutableSyncState.value = SyncState.ServerUnavailable
                false
            }
        }
    }

    private suspend fun pushPending(server: Server, spaces: List<Space>, default: String?) {
        val writable = spaces.filter(Space::writable).map(Space::id).toSet()
        val batchSize = 30
        while (true) {
            val entries = dao.pendingBatch(batchSize)
            for (share in entries) {
                val spaceId = share.spaceId ?: default
                if (spaceId == null) {
                    dao.flag(share.id, "choose_default")
                    continue
                }
                if (spaceId !in writable) {
                    dao.flag(share.id, "choose_space")
                    continue
                }
                if (share.spaceId == null) dao.retarget(share.id, spaceId, share.id)
                try {
                    dao.finishShare(share.id, server.create(spaceId, share))
                } catch (error: ServerFailure) {
                    when (error.status) {
                        403, 404 -> dao.flag(share.id, "choose_space")
                        400, 409 -> dao.flag(share.id, "rejected")
                        else -> throw error
                    }
                }
            }
            if (entries.size < batchSize) return
        }
    }

    private fun downloadBookmarks(server: Server, id: String): List<Bookmark> {
        val bookmarks = linkedMapOf<String, Bookmark>()
        var offset = 0
        var expected: Int? = null
        while (true) {
            val page = server.bookmarks(id, offset)
            if (expected != null && expected != page.total) throw SnapshotChanged()
            expected = page.total
            for (bookmark in page.items) {
                if (bookmark.spaceId != id || bookmarks.put(bookmark.id, bookmark) != null) {
                    throw SnapshotChanged()
                }
            }
            offset += page.items.size
            if (offset == page.total) return bookmarks.values.toList()
            if (offset > page.total || page.items.isEmpty()) throw SnapshotChanged()
        }
    }
}

class LinktiveSyncWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        val library = (applicationContext as LinktiveApplication).library
        return if (library.synchronize()) Result.success() else Result.retry()
    }
}

private val network = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

fun scheduleSync(context: Context, policy: ExistingWorkPolicy) {
    val work = OneTimeWorkRequestBuilder<LinktiveSyncWorker>()
        .setConstraints(network)
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
        .build()
    WorkManager.getInstance(context).enqueueUniqueWork("linktive-sync", policy, work)
}

fun schedulePeriodicSync(context: Context) {
    val work = PeriodicWorkRequestBuilder<LinktiveSyncWorker>(1, TimeUnit.HOURS)
        .setConstraints(network)
        .build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork("linktive-periodic-sync", ExistingPeriodicWorkPolicy.KEEP, work)
}

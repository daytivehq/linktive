package com.daytive.linktive

import android.app.Application
import androidx.room.Room
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.SQLiteMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
@SQLiteMode(SQLiteMode.Mode.NATIVE)
class LibraryDatabaseTest {
    @Test fun keepsTheOfflineShareAndCacheUntilTheServerReturns() = runBlocking {
        val context = RuntimeEnvironment.getApplication()
        val databaseName = "offline-queue-test.db"
        val space = Space("chosen", "Mobile", "owner")
        val cached = Bookmark("cache-id", space.id, "https://example.org/cached", "Cached", "dev", "2026-11-26")
        val pending = PendingShare("request-id", space.id, "https://example.org/share", "Shared", 1)

        suspend fun useLibrary(action: suspend (LibraryDao) -> Unit) {
            val database = Room.databaseBuilder(context, LibraryDatabase::class.java, databaseName).build()
            try {
                action(database.library())
            } finally {
                database.close()
            }
        }

        try {
            useLibrary { library ->
                library.replaceSpaces(listOf(space))
                library.putBookmarks(listOf(cached))
                library.queue(pending)
                library.queue(pending)
            }
            useLibrary { library ->
                assertEquals(listOf(pending), library.pendingBatch(30))
                assertEquals(listOf(cached), library.observeBookmarks().first())
                val saved = Bookmark("server-id", space.id, pending.url, pending.title, "", "2026-11-27")
                library.finishShare(pending.id, saved)
                assertEquals(emptyList<PendingShare>(), library.pendingBatch(30))
                assertEquals(listOf(saved, cached), library.observeBookmarks().first())
            }
        } finally {
            context.deleteDatabase(databaseName)
        }
        Unit
    }
}

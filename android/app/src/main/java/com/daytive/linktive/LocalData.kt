package com.daytive.linktive

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "spaces")
data class Space(@PrimaryKey val id: String, val name: String, val role: String) {
    val writable get() = role == "owner" || role == "editor"
}

@Entity(tableName = "bookmarks")
data class Bookmark(
    @PrimaryKey val id: String,
    val spaceId: String,
    val url: String,
    val title: String,
    val tags: String,
    val createdAt: String,
)

@Entity(tableName = "pending_shares")
data class PendingShare(
    @PrimaryKey val id: String,
    val spaceId: String?,
    val url: String,
    val title: String,
    val createdAt: Long,
    val issue: String? = null,
)

@Dao
abstract class LibraryDao {
    @Query("SELECT * FROM spaces ORDER BY name COLLATE NOCASE, id")
    abstract fun observeSpaces(): Flow<List<Space>>

    @Query("SELECT * FROM bookmarks ORDER BY createdAt DESC, id")
    abstract fun observeBookmarks(): Flow<List<Bookmark>>

    @Query("SELECT * FROM pending_shares ORDER BY createdAt, id")
    abstract fun observePending(): Flow<List<PendingShare>>

    @Query("SELECT * FROM pending_shares WHERE issue IS NULL ORDER BY createdAt, id LIMIT :limit")
    abstract suspend fun pendingBatch(limit: Int): List<PendingShare>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    abstract suspend fun queue(share: PendingShare)

    @Query("UPDATE pending_shares SET spaceId = :spaceId, issue = NULL WHERE spaceId IS NULL")
    abstract suspend fun assignUnassigned(spaceId: String)

    @Query("UPDATE pending_shares SET id = :requestId, spaceId = :spaceId, issue = NULL WHERE id = :id")
    abstract suspend fun retarget(id: String, spaceId: String, requestId: String)

    @Query("UPDATE pending_shares SET issue = :issue WHERE id = :id")
    abstract suspend fun flag(id: String, issue: String)

    @Query("DELETE FROM pending_shares WHERE id = :id")
    abstract suspend fun removePending(id: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun putBookmarks(bookmarks: List<Bookmark>)

    @Transaction
    open suspend fun finishShare(id: String, bookmark: Bookmark) {
        putBookmarks(listOf(bookmark))
        removePending(id)
    }

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun putSpaces(spaces: List<Space>)

    @Query("DELETE FROM spaces")
    abstract suspend fun clearSpaces()

    @Query("DELETE FROM bookmarks WHERE NOT EXISTS (SELECT 1 FROM spaces WHERE spaces.id = bookmarks.spaceId)")
    abstract suspend fun clearInaccessibleBookmarks()

    @Transaction
    open suspend fun replaceSpaces(spaces: List<Space>) {
        clearSpaces()
        putSpaces(spaces)
        clearInaccessibleBookmarks()
    }

    @Query("DELETE FROM bookmarks WHERE spaceId = :spaceId")
    abstract suspend fun clearBookmarks(spaceId: String)

    @Transaction
    open suspend fun replaceBookmarks(spaceId: String, bookmarks: List<Bookmark>) {
        clearBookmarks(spaceId)
        putBookmarks(bookmarks)
    }
}

@Database(entities = [Space::class, Bookmark::class, PendingShare::class], version = 1)
abstract class LibraryDatabase : RoomDatabase() {
    abstract fun library(): LibraryDao
}

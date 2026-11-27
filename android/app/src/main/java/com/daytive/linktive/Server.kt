package com.daytive.linktive

import java.io.IOException
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

data class SharedLink(val url: String, val title: String)

private val sharedUrl = Regex("""https?://[^\s<>"]+""", RegexOption.IGNORE_CASE)

fun parseSharedLink(text: String, subject: String?): SharedLink? {
    val match = sharedUrl.find(text) ?: return null
    var url = match.value.trimEnd('.', ',', '!', ';')
    while (url.endsWith(')') && url.count { it == ')' } > url.count { it == '(' }) {
        url = url.dropLast(1)
    }
    if (url.toHttpUrlOrNull() == null) return null
    val title = subject?.trim()?.takeIf { it.isNotEmpty() && it != url }
        ?: text.substring(0, match.range.first).trim().trimEnd(':', '-', '–', '(', '[').trim()
    return SharedLink(url, title.take(500))
}

fun parseServerAddress(raw: String, allowDevelopmentHttp: Boolean): HttpUrl? {
    val url = raw.trim().toHttpUrlOrNull() ?: return null
    if (url.username.isNotEmpty() || url.password.isNotEmpty() ||
        url.query != null || url.fragment != null) return null
    if (url.isHttps) return url
    if (!allowDevelopmentHttp) return null
    if (url.host == "localhost" || url.host == "::1") return url
    val octets = url.host.split('.').mapNotNull(String::toIntOrNull)
    if (octets.size != 4 || octets.any { it !in 0..255 }) return null
    val (a, b) = octets
    val developmentHost = a == 127 || a == 10 || a == 192 && b == 168 ||
        a == 172 && b in 16..31 || a == 100 && b in 64..127
    return url.takeIf { developmentHost }
}

data class Profile(val userId: String, val defaultSpace: String, val spaces: List<Space>)
data class BookmarkPage(val items: List<Bookmark>, val total: Int)

class ServerFailure(val status: Int) : IOException("서버 응답: HTTP $status")
class SnapshotChanged : IOException("동기화 중 북마크 목록이 바뀌었습니다.")

class Server(
    private val base: HttpUrl,
    private val apiKey: String,
    private val http: OkHttpClient,
) {
    fun profile(): Profile {
        val result = call("auth", "me")
        val user = result.getJSONObject("user")
        val settings = runCatching { JSONObject(user.optString("settings_json")) }.getOrNull()
        val spaces = result.getJSONArray("workspaces")
        return Profile(
            userId = user.getString("id"),
            defaultSpace = settings?.optString("default_workspace_id").orEmpty(),
            spaces = List(spaces.length()) { index ->
                val space = spaces.getJSONObject(index)
                Space(space.getString("id"), space.getString("name"), space.getString("role"))
            },
        )
    }

    fun bookmarks(spaceId: String, offset: Int): BookmarkPage {
        val result = call("workspaces", spaceId, "bookmarks", query = mapOf(
            "limit" to "100", "offset" to offset.toString(), "sort" to "oldest",
        ))
        val items = result.getJSONArray("items")
        return BookmarkPage(
            List(items.length()) { decodeBookmark(items.getJSONObject(it)) },
            result.getInt("total"),
        )
    }

    fun create(spaceId: String, share: PendingShare): Bookmark {
        val payload = JSONObject().put("url", share.url).put("title", share.title)
        val result = call(
            "workspaces", spaceId, "bookmarks",
            body = payload, idempotencyKey = share.id,
        )
        return decodeBookmark(result)
    }

    private fun call(
        vararg path: String,
        query: Map<String, String> = emptyMap(),
        body: JSONObject? = null,
        idempotencyKey: String? = null,
    ): JSONObject {
        val url = base.newBuilder().encodedPath(base.encodedPath.trimEnd('/') + "/")
        for (segment in listOf("api", "v1", *path)) url.addPathSegment(segment)
        for ((key, value) in query) url.addQueryParameter(key, value)
        val request = Request.Builder().url(url.build()).header("Authorization", "Bearer $apiKey")
        if (body != null) {
            request.post(body.toString().toRequestBody("application/json".toMediaType()))
        }
        if (idempotencyKey != null) request.header("Idempotency-Key", idempotencyKey)
        return http.newCall(request.build()).execute().use { response ->
            if (response.code == 409) {
                val existing = JSONObject(response.body?.string().orEmpty()).optJSONObject("existing")
                if (existing != null && body != null &&
                    existing.optString("workspace_id") == path.getOrNull(1)) return@use existing
            }
            if (!response.isSuccessful) throw ServerFailure(response.code)
            JSONObject(response.body?.string() ?: throw IOException("서버 응답이 비어 있습니다."))
        }
    }

    private fun decodeBookmark(data: JSONObject): Bookmark {
        val tags = data.optJSONArray("tags")
        return Bookmark(
            id = data.getString("id"),
            spaceId = data.getString("workspace_id"),
            url = data.getString("url"),
            title = data.optString("title"),
            tags = if (tags == null) "" else List(tags.length()) { tags.getString(it) }.joinToString(" · "),
            createdAt = data.getString("created_at"),
        )
    }
}

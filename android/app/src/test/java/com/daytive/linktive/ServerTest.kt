package com.daytive.linktive

import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class ServerTest {
    @Test fun sendsPendingShareToItsWorkspaceWithTheSameIdOnRetry() {
        MockWebServer().use { service ->
            val body = """{"id":"saved-id","workspace_id":"chosen","url":"https://example.org/bookmark","title":"Example","created_at":"2026-11-27T00:00:00Z"}"""
            service.enqueue(MockResponse().setResponseCode(201).setBody(body))
            service.enqueue(MockResponse().setResponseCode(200).setBody(body))
            val server = Server(service.url("/linktive/"), "lkt_test", OkHttpClient())
            val share = PendingShare("queued-request", "chosen", "https://example.org/bookmark", "Example", 0)
            assertEquals("saved-id", server.create("chosen", share).id)
            assertEquals("saved-id", server.create("chosen", share).id)
            repeat(2) {
                val request = service.takeRequest()
                assertEquals("/linktive/api/v1/workspaces/chosen/bookmarks", request.path)
                assertEquals("queued-request", request.getHeader("Idempotency-Key"))
                assertEquals("Bearer lkt_test", request.getHeader("Authorization"))
                assertEquals(share.url, JSONObject(request.body.readUtf8()).getString("url"))
            }
        }
    }
}

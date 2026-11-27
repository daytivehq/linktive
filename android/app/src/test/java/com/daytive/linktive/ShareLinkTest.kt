package com.daytive.linktive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class ShareLinkTest {
    @Test fun readsChromeUrlAndSubject() {
        assertEquals(
            SharedLink("https://example.org/a?q=1", "Article title"),
            parseSharedLink("https://example.org/a?q=1", "Article title"),
        )
    }

    @Test fun readsYoutubeStyleText() {
        assertEquals(
            SharedLink("https://youtu.be/example", "Video title"),
            parseSharedLink("Video title\n(https://youtu.be/example)", null),
        )
    }

    @Test fun rejectsTextWithoutWebUrl() {
        assertNull(parseSharedLink("content://example.provider/item", "File name"))
    }

    @Test fun permitsHttpOnlyForPrivateDevelopmentServers() {
        assertNotNull(parseServerAddress("https://linktive.example", false))
        assertNull(parseServerAddress("http://100.64.0.10:18080", false))
        assertNotNull(parseServerAddress("http://100.64.0.10:18080", true))
        assertNull(parseServerAddress("http://example.org", true))
        assertNull(parseServerAddress("https://user:pass@linktive.example", true))
    }
}

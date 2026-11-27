package com.daytive.linktive

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.lifecycleScope
import androidx.work.ExistingWorkPolicy
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val library = (application as LinktiveApplication).library
        setContent {
            LinktiveScreen(
                library = library,
                syncNow = { scheduleSync(this, ExistingWorkPolicy.REPLACE) },
            )
        }
    }

    override fun onStart() {
        super.onStart()
        scheduleSync(this, ExistingWorkPolicy.KEEP)
    }
}

class ShareActivity : ComponentActivity() {
    private lateinit var requestId: String

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestId = savedInstanceState?.getString("request_id") ?: UUID.randomUUID().toString()
        val link = if (intent.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            parseSharedLink(
                intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString().orEmpty(),
                intent.getStringExtra(Intent.EXTRA_SUBJECT),
            )
        } else null
        if (link == null) {
            Toast.makeText(this, R.string.share_no_url, Toast.LENGTH_SHORT).show()
            finish()
            return
        }
        lifecycleScope.launch {
            try {
                val library = (application as LinktiveApplication).library
                val hasDestination = library.queue(link, requestId)
                Toast.makeText(this@ShareActivity, if (hasDestination) R.string.share_queued else R.string.share_needs_setup,
                    Toast.LENGTH_SHORT).show()
                if (!hasDestination) {
                    startActivity(Intent(this@ShareActivity, MainActivity::class.java))
                }
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (_: Exception) {
                Toast.makeText(this@ShareActivity, R.string.share_save_failed, Toast.LENGTH_SHORT).show()
            } finally {
                finish()
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("request_id", requestId)
        super.onSaveInstanceState(outState)
    }
}

package com.daytive.linktive

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

data class Connection(
    val serverUrl: String,
    val userId: String,
    val defaultSpaceId: String?,
)

class ConnectionStore(context: Context) {
    private val preferences = context.getSharedPreferences("connection", Context.MODE_PRIVATE)
    private val mutableConnection = MutableStateFlow(load())
    val current = mutableConnection.asStateFlow()

    fun save(connection: Connection, apiKey: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, encryptionKey())
        val encrypted = cipher.doFinal(apiKey.toByteArray(Charsets.UTF_8))
        check(preferences.edit()
            .putString("server", connection.serverUrl)
            .putString("user", connection.userId)
            .putString("workspace", connection.defaultSpaceId)
            .putString("encrypted_key", Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .putString("key_iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .commit())
        mutableConnection.value = connection
    }

    fun setDefaultSpace(id: String) {
        val previous = current.value ?: return
        check(preferences.edit().putString("workspace", id).commit())
        mutableConnection.value = previous.copy(defaultSpaceId = id)
    }

    fun apiKey(): String? = runCatching {
        val iv = preferences.getString("key_iv", null) ?: return null
        val data = preferences.getString("encrypted_key", null) ?: return null
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
        cipher.doFinal(Base64.decode(data, Base64.NO_WRAP)).toString(Charsets.UTF_8)
    }.getOrNull()

    private fun load(): Connection? {
        val serverUrl = preferences.getString("server", null) ?: return null
        val userId = preferences.getString("user", null) ?: return null
        return Connection(serverUrl, userId, preferences.getString("workspace", null))
    }

    private fun encryptionKey(): SecretKey {
        val alias = "linktive-api-key"
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        return keyStore.getKey(alias, null) as? SecretKey ?: KeyGenerator
            .getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            .apply {
                init(KeyGenParameterSpec.Builder(
                    alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build())
            }.generateKey()
    }
}

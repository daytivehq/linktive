package com.daytive.linktive

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

private val linktiveColors = lightColorScheme(
    primary = Color(0xFF00658F),
    onPrimary = Color.White,
    surface = Color(0xFFF6F8FC),
    onSurface = Color(0xFF152636),
)

@Composable
fun LinktiveScreen(library: LibraryRepository, syncNow: () -> Unit) {
    val connection by library.connection.collectAsStateWithLifecycle()
    val spaces by library.spaces.collectAsStateWithLifecycle(initialValue = emptyList())
    val bookmarks by library.bookmarks.collectAsStateWithLifecycle(initialValue = emptyList())
    val pending by library.pending.collectAsStateWithLifecycle(initialValue = emptyList())
    val syncState by library.syncState.collectAsStateWithLifecycle()
    val writable = spaces.filter(Space::writable)
    val defaultSpace = writable.firstOrNull { it.id == connection?.defaultSpaceId }
    val scope = rememberCoroutineScope()
    var settingsOpen by rememberSaveable { mutableStateOf(false) }
    var pendingToMove by remember { mutableStateOf<PendingShare?>(null) }
    var pendingToRemove by remember { mutableStateOf<PendingShare?>(null) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var filter by rememberSaveable { mutableStateOf("") }
    var viewSpace by rememberSaveable { mutableStateOf<String?>(null) }
    val openLink = LocalUriHandler.current

    fun perform(action: suspend () -> Unit) {
        scope.launch {
            actionError = null
            try {
                action()
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                actionError = "변경을 저장하지 못했습니다."
            }
        }
    }

    MaterialTheme(colorScheme = linktiveColors) {
        androidx.compose.material3.Surface(Modifier.fillMaxSize()) {
            Box(
                modifier = Modifier.fillMaxSize().padding(WindowInsets.safeDrawing.asPaddingValues()),
                contentAlignment = Alignment.TopCenter,
            ) {
                LazyColumn(
                    modifier = Modifier.widthIn(max = 760.dp).fillMaxWidth().padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text("linktive", style = MaterialTheme.typography.headlineMedium)
                            if (connection != null) {
                                TextButton(onClick = { settingsOpen = !settingsOpen }) {
                                    Text(if (settingsOpen) "북마크" else "설정")
                                }
                            }
                        }
                    }
                    if (settingsOpen || connection == null) {
                        item {
                            ConnectionForm(
                                connection = connection,
                                onConnect = library::connect,
                            )
                        }
                        if (connection != null) {
                            item {
                                SpaceMenu(
                                    label = defaultSpace?.let { "공유 저장 기본 소속 · ${it.name}" } ?: "공유 저장 기본 소속 선택",
                                    spaces = writable,
                                    onSelect = { item -> perform { library.setDefaultSpace(item.id) } },
                                )
                                if (writable.isEmpty()) Text("북마크를 추가할 수 있는 소속이 없습니다.")
                            }
                        }
                    } else {
                        item {
                            Row(
                                Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                val message = when (syncState) {
                                    SyncState.Idle -> "기기에 저장된 북마크"
                                    SyncState.Syncing -> "동기화 중"
                                    SyncState.Synced -> "동기화 완료"
                                    SyncState.ServerUnavailable -> "서버 연결 대기 중"
                                    SyncState.Reconnect -> "설정에서 API 키를 다시 연결하세요"
                                }
                                Text(message, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                                TextButton(onClick = syncNow) { Text("지금 동기화") }
                            }
                        }
                    }
                    actionError?.let { message ->
                        item { Text(message, color = MaterialTheme.colorScheme.error) }
                    }
                    if (pending.isNotEmpty()) {
                        item {
                            Text("저장 대기 · ${pending.size}", style = MaterialTheme.typography.titleMedium)
                        }
                        items(pending, key = { it.id }) { entry ->
                            val destination = spaces.firstOrNull { it.id == entry.spaceId }?.name
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(entry.title.ifBlank { entry.url }, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                val status = when (entry.issue) {
                                    "choose_default", "choose_space" -> "저장할 소속을 다시 선택하세요"
                                    "rejected" -> "서버가 이 저장 요청을 처리할 수 없습니다"
                                    else -> destination?.let { "$it · 동기화 대기" } ?: "기본 소속 · 동기화 대기"
                                }
                                Text(status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                                if (entry.issue != null) {
                                    Row {
                                        if (entry.issue != "rejected" && writable.isNotEmpty()) {
                                            TextButton(onClick = { pendingToMove = entry }) { Text("소속 변경") }
                                        }
                                        TextButton(onClick = { pendingToRemove = entry }) { Text("대기 항목 삭제") }
                                    }
                                }
                            }
                        }
                    }
                    if (!settingsOpen && connection != null) {
                        item {
                            OutlinedTextField(
                                value = filter,
                                onValueChange = { filter = it },
                                singleLine = true,
                                label = { Text("북마크 검색") },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            SpaceMenu(
                                label = spaces.firstOrNull { it.id == viewSpace }?.name ?: "전체 소속",
                                spaces = spaces,
                                includeAll = true,
                                onSelect = { viewSpace = it.id },
                                onAll = { viewSpace = null },
                            )
                        }
                        val selectedSpace = viewSpace?.takeIf { id -> spaces.any { it.id == id } }
                        val visible = bookmarks.filter { item ->
                            (selectedSpace == null || item.spaceId == selectedSpace) &&
                                (item.url.contains(filter, true) || item.title.contains(filter, true) ||
                                    item.tags.contains(filter, true))
                        }
                        if (visible.isEmpty()) {
                            item { Text(if (filter.isBlank()) "표시할 북마크가 없습니다." else "검색 결과가 없습니다.") }
                        }
                        items(visible, key = { it.id }) { item ->
                            Column(
                                modifier = Modifier.fillMaxWidth().clickable {
                                    try {
                                        openLink.openUri(item.url)
                                    } catch (_: IllegalArgumentException) {
                                        actionError = "이 링크를 열 수 없습니다."
                                    }
                                }.padding(vertical = 6.dp),
                                verticalArrangement = Arrangement.spacedBy(3.dp),
                            ) {
                                Text(item.title.ifBlank { item.url }, style = MaterialTheme.typography.titleMedium)
                                Text(item.url, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                if (item.tags.isNotEmpty()) Text(item.tags, style = MaterialTheme.typography.labelMedium)
                            }
                            HorizontalDivider()
                        }
                    }
                    item { Box(Modifier.padding(bottom = 12.dp)) }
                }
            }
        }
        pendingToMove?.let { entry ->
            AlertDialog(
                onDismissRequest = { pendingToMove = null },
                title = { Text("저장할 소속 선택") },
                text = {
                    SpaceMenu(label = "소속 선택", spaces = writable, onSelect = { target ->
                        perform { library.changePendingSpace(entry.id, target.id) }
                        pendingToMove = null
                    })
                },
                confirmButton = {
                    TextButton(onClick = { pendingToMove = null }) { Text("취소") }
                },
            )
        }
        pendingToRemove?.let { entry ->
            AlertDialog(
                onDismissRequest = { pendingToRemove = null },
                title = { Text("대기 항목을 삭제할까요?") },
                text = { Text(entry.title.ifBlank { entry.url }) },
                confirmButton = {
                    TextButton(onClick = {
                        perform { library.dismissPending(entry.id) }
                        pendingToRemove = null
                    }) { Text("삭제") }
                },
                dismissButton = { TextButton(onClick = { pendingToRemove = null }) { Text("취소") } },
            )
        }
    }
}

@Composable
private fun ConnectionForm(connection: Connection?, onConnect: suspend (String, String) -> Unit) {
    var url by rememberSaveable(connection?.serverUrl) { mutableStateOf(connection?.serverUrl.orEmpty()) }
    var key by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }
    var connected by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("서버 연결", style = MaterialTheme.typography.titleMedium)
        Text("웹의 설정 → 계정 · API에서 이 기기용 API 키를 발급하세요.")
        OutlinedTextField(
            value = url, onValueChange = { url = it }, modifier = Modifier.fillMaxWidth(),
            label = { Text("서버 주소") }, placeholder = { Text("https://linktive.example.com") },
            singleLine = true, enabled = connection == null && !busy,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
        )
        OutlinedTextField(
            value = key, onValueChange = { key = it }, modifier = Modifier.fillMaxWidth(),
            label = { Text("API 키") }, placeholder = { Text("lkt_…") },
            singleLine = true, enabled = !busy,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(enabled = url.isNotBlank() && key.isNotBlank() && !busy, onClick = {
                busy = true
                connected = false
                message = null
                scope.launch {
                    try {
                        onConnect(url, key)
                        key = ""
                        connected = true
                        message = "연결되었습니다."
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: Exception) {
                        message = if (error is ServerFailure && error.status == 401)
                            "API 키를 확인해 주세요." else error.message ?: "서버에 연결할 수 없습니다."
                    } finally {
                        busy = false
                    }
                }
            }) { Text("연결 확인 및 저장") }
            if (busy) CircularProgressIndicator(Modifier.widthIn(max = 20.dp), strokeWidth = 2.dp)
        }
        message?.let {
            Text(it, color = if (connected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun SpaceMenu(
    label: String,
    spaces: List<Space>,
    onSelect: (Space) -> Unit,
    includeAll: Boolean = false,
    onAll: () -> Unit = {},
) {
    var open by remember { mutableStateOf(false) }
    Box {
        TextButton(enabled = spaces.isNotEmpty(), onClick = { open = true }) { Text(label) }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            if (includeAll) DropdownMenuItem(text = { Text("전체 소속") }, onClick = { open = false; onAll() })
            for (space in spaces) {
                DropdownMenuItem(text = { Text(space.name) }, onClick = { open = false; onSelect(space) })
            }
        }
    }
}

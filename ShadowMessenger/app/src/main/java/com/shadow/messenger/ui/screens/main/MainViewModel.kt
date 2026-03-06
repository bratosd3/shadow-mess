package com.shadow.messenger.ui.screens.main

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.shadow.messenger.data.remote.SocketManager
import com.shadow.messenger.data.repository.MessengerRepository
import com.shadow.messenger.data.repository.PrefsRepository
import com.shadow.messenger.domain.model.Chat
import com.shadow.messenger.domain.model.User
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import javax.inject.Inject

data class MainState(
    val chats: List<Chat> = emptyList(),
    val currentUser: User? = null,
    val selectedChatId: String? = null,
    val isLoading: Boolean = true,
    val searchQuery: String = "",
    val searchResults: List<User> = emptyList(),
    val isSearching: Boolean = false,
    val showNewChat: Boolean = false,
    val showSettings: Boolean = false,
    val showCustomize: Boolean = false,
    val error: String? = null,
    val connectionState: SocketManager.ConnectionState = SocketManager.ConnectionState.DISCONNECTED
)

@HiltViewModel
class MainViewModel @Inject constructor(
    private val repository: MessengerRepository,
    private val prefs: PrefsRepository
) : ViewModel() {

    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    private val _state = MutableStateFlow(MainState())
    val state: StateFlow<MainState> = _state

    val themeFlow = prefs.themeFlow
    val accentFlow = prefs.accentFlow

    init {
        loadInitialData()
        observeSocket()
        observeCachedChats()
    }

    private fun loadInitialData() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }

            // Load user
            repository.getMe().onSuccess { user ->
                _state.update { it.copy(currentUser = user) }
            }

            // Load chats
            repository.loadChats().fold(
                onSuccess = { chats ->
                    _state.update { it.copy(chats = chats, isLoading = false) }
                },
                onFailure = { e ->
                    _state.update { it.copy(error = e.message, isLoading = false) }
                }
            )
        }
    }

    private fun observeCachedChats() {
        viewModelScope.launch {
            repository.observeChats().collect { chats ->
                _state.update { it.copy(chats = chats) }
            }
        }
    }

    private fun observeSocket() {
        val socket = repository.socket()

        viewModelScope.launch {
            socket.connectionState.collect { conn ->
                _state.update { it.copy(connectionState = conn) }
            }
        }

        viewModelScope.launch {
            socket.onChatCreated().collect {
                repository.loadChats()
            }
        }

        viewModelScope.launch {
            socket.onChatUpdated().collect {
                repository.loadChats()
            }
        }

        viewModelScope.launch {
            socket.onChatDeleted().collect {
                repository.loadChats()
            }
        }

        viewModelScope.launch {
            socket.onNewMessage().collect {
                // Reload chats to update last message
                repository.loadChats()
            }
        }
    }

    fun selectChat(chatId: String) {
        _state.update { it.copy(selectedChatId = chatId) }
        repository.socket().joinChat(chatId)
        repository.socket().markRead(chatId)
    }

    fun clearSelectedChat() {
        _state.update { it.copy(selectedChatId = null) }
    }

    fun searchUsers(query: String) {
        _state.update { it.copy(searchQuery = query) }
        if (query.length < 2) {
            _state.update { it.copy(searchResults = emptyList()) }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isSearching = true) }
            repository.searchUsers(query).fold(
                onSuccess = { users ->
                    _state.update { it.copy(searchResults = users, isSearching = false) }
                },
                onFailure = {
                    _state.update { it.copy(isSearching = false) }
                }
            )
        }
    }

    fun createPrivateChat(userId: String) {
        viewModelScope.launch {
            repository.createPrivateChat(userId).onSuccess { chat ->
                _state.update {
                    it.copy(
                        selectedChatId = chat.id,
                        showNewChat = false,
                        searchQuery = "",
                        searchResults = emptyList()
                    )
                }
                repository.loadChats()
            }
        }
    }

    fun toggleNewChat() {
        _state.update { it.copy(showNewChat = !it.showNewChat) }
    }

    fun toggleSettings() {
        _state.update { it.copy(showSettings = !it.showSettings) }
    }

    fun toggleCustomize() {
        _state.update { it.copy(showCustomize = !it.showCustomize) }
    }

    fun logout() {
        viewModelScope.launch {
            repository.logout()
        }
    }

    fun saveTheme(theme: String) {
        viewModelScope.launch { prefs.saveTheme(theme) }
    }

    fun saveAccent(color: String) {
        viewModelScope.launch { prefs.saveAccent(color) }
    }

    fun refreshChats() {
        viewModelScope.launch {
            repository.loadChats()
        }
    }
}

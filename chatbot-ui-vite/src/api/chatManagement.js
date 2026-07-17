import axios from 'axios'

// Set VITE_API_URL to the deployed backend's origin in production (see render.yaml);
// falls back to localhost for local dev, matching the previous hardcoded default.
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001'

const api = axios.create({
  baseURL: API_BASE_URL,
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Chat Management API functions
export const ChatManagementAPI = {
  renameChat: async (chatId, newTitle) => {
    try {
      const response = await api.patch(`/api/chat/${chatId}/rename`, {
        title: newTitle,
      })
      return response.data
    } catch (error) {
      console.error('Error renaming chat:', error)
      throw error
    }
  },

  pinChat: async (chatId, isPinned) => {
    try {
      const response = await api.patch(`/api/chat/${chatId}/pin`, {
        is_pinned: isPinned,
      })
      return response.data
    } catch (error) {
      console.error('Error pinning chat:', error)
      throw error
    }
  },

  archiveChat: async (chatId) => {
    try {
      const response = await api.patch(`/api/chat/${chatId}/archive`)
      return response.data
    } catch (error) {
      console.error('Error archiving chat:', error)
      throw error
    }
  },

  deleteChat: async (chatId) => {
    try {
      const response = await api.delete(`/api/chat/${chatId}`)
      return response.data
    } catch (error) {
      console.error('Error deleting chat:', error)
      throw error
    }
  },

  shareChat: async (chatId, title, messages) => {
    try {
      const response = await api.post(`/api/chat/${chatId}/share`, {
        title,
        messages,
      })
      return response.data
    } catch (error) {
      console.error('Error sharing chat:', error)
      throw error
    }
  },

  startGroupChat: async (chatId, collaborators) => {
    try {
      const response = await api.post(`/api/chat/${chatId}/group`, {
        collaborators: collaborators,
      })
      return response.data
    } catch (error) {
      console.error('Error starting group chat:', error)
      throw error
    }
  },

  getChatInfo: async (chatId) => {
    try {
      const response = await api.get(`/api/chat/${chatId}/info`)
      return response.data
    } catch (error) {
      console.error('Error getting chat info:', error)
      throw error
    }
  },
}

export default ChatManagementAPI

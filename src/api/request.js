import axios from 'axios'

// 从全局配置获取 baseURL，或使用默认值
const baseURL = window.CHATBOT_CONFIG?.baseUrl ?? ''

const request = axios.create({
  baseURL,
  timeout: 30000,
})

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    const token = window.CHATBOT_CONFIG?.token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// 响应拦截器
request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.message || error.message || '请求失败'
    console.error('[API Error]', message)
    return Promise.reject(error)
  },
)

export default request
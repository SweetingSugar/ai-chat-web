import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { useAuth } from './composables/useAuth'

createApp(App).use(router).mount('#app')

// 启动时有已保存 token 则调用 /api/auth/me 恢复会话并刷新用户信息
void useAuth().hydrate()

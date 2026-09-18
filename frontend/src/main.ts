import { createApp } from 'vue'
import { createPinia } from 'pinia'

import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@phosphor-icons/web/regular'
import '@phosphor-icons/web/fill'

import './assets/nocturne.css'
import './assets/app.css'
import App from './App.vue'
import { router } from './router'

createApp(App).use(createPinia()).use(router).mount('#app')

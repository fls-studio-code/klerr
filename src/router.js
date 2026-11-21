import { createRouter, createWebHistory } from 'vue-router'
import LandingView from './views/LandingView.vue'

// Тренажёр грузится лениво: sql.js + wasm весят заметно, лендингу они не нужны.
const TrainerView = () => import('./views/TrainerView.vue')

export const router = createRouter({
  history: createWebHistory('/'),
  routes: [
    { path: '/', name: 'landing', component: LandingView },
    { path: '/sql-trainer', name: 'trainer', component: TrainerView },
    // Старая ссылка из закладок и из поиска — переводим на чистый адрес.
    { path: '/sql-trainer.html', redirect: { name: 'trainer' } },
    { path: '/:pathMatch(.*)*', redirect: { name: 'landing' } },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

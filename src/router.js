import { createRouter, createWebHistory } from 'vue-router'
import LandingView from './views/LandingView.vue'

// Тренажёр грузится лениво: sql.js + wasm весят заметно, лендингу они не нужны.
const TrainerView = () => import('./views/TrainerView.vue')
// Лаборатория Transformers: интерпретатор мини-Python и модели (урок 11 курса Data Science).
const LabView = () => import('./views/LabView.vue')

export const router = createRouter({
  history: createWebHistory('/'),
  routes: [
    { path: '/', name: 'landing', component: LandingView },
    { path: '/sql-trainer', name: 'trainer', component: TrainerView },
    { path: '/transformers-lab', name: 'lab', component: LabView },
    // Старая ссылка из закладок и из поиска — переводим на чистый адрес.
    { path: '/sql-trainer.html', redirect: { name: 'trainer' } },
    { path: '/:pathMatch(.*)*', redirect: { name: 'landing' } },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

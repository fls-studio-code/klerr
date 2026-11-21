<script setup>
import '../styles/landing.css'
import KlerrMark from '../components/KlerrMark.vue'
import GameCard from '../components/GameCard.vue'

const games = [
  {
    name: 'Fishing Kitty',
    href: 'https://www.roblox.com/games/108186393335024/Fishing-Kitty',
    cover: 'https://tr.rbxcdn.com/180DAY-609e30c057759dae6a5873f7f76f8f6f/512/512/Image/Png/noFilter',
  },
  {
    name: 'Egg Factory',
    href: 'https://www.roblox.com/games/109742109264863/Egg-Factory',
    cover: 'https://tr.rbxcdn.com/180DAY-adb25ec203f570e4affbd80e5eb5711d/512/512/Image/Png/noFilter',
  },
  {
    name: 'Lucky Arsenal Royale',
    href: 'https://www.roblox.com/games/138070159103228/Lucky-Arsenal-Royale',
    cover: 'https://tr.rbxcdn.com/180DAY-c6e55697e603ca890b60cff99e84862e/512/512/Image/Png/noFilter',
  },
]
</script>

<template>
  <div class="landing-root">
    <div class="bg-grid" aria-hidden="true"></div>
    <div class="blob blob--a" aria-hidden="true"></div>
    <div class="blob blob--b" aria-hidden="true"></div>

    <main class="shell">
      <div class="stage">

        <section class="lead-col">
          <div class="lockup">
            <span class="mark" aria-hidden="true"><KlerrMark /></span>
            <h1 class="wordmark" aria-label="klerr.dev">Klerr<span class="tld">.dev</span><span class="caret" aria-hidden="true"></span></h1>
          </div>

          <p class="tagline">SQL <span>·</span> Training Studio</p>

          <p class="lede">
            Практикуй SQL-запросы в браузере: от первого <code>SELECT</code> до
            <code>JOIN</code>, оконных функций и оптимизации запросов.
          </p>

          <div class="cta-wrap">
            <RouterLink class="cta" to="/sql-trainer">
              <span class="cta-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2c4.418 0 8 1.343 8 3s-3.582 3-8 3-8-1.343-8-3 3.582-3 8-3Z" />
                  <path d="M4 5v14c0 1.657 3.582 3 8 3s8-1.343 8-3V5" />
                  <path d="M4 12c0 1.657 3.582 3 8 3s8-1.343 8-3" />
                </svg>
              </span>
              <span class="cta-text">
                <span class="cta-title">SQL-Trainer</span>
                <span class="cta-sub">начать тренировку</span>
              </span>
              <span class="cta-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </span>
            </RouterLink>
            <span class="path">→ <b>/sql-trainer</b></span>

            <a class="cta cta--ghost" href="https://learn.microsoft.com/en-us/sql/samples/adventureworks-install-configure?view=sql-server-ver17&amp;tabs=ssms" target="_blank" rel="noopener noreferrer">
              <span class="cta-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" />
                  <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" />
                </svg>
              </span>
              <span class="cta-text">
                <span class="cta-title">AdventureWorks</span>
                <span class="cta-sub">установить базу данных</span>
              </span>
              <span class="cta-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M15 3h6v6" />
                  <path d="M10 14 21 3" />
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                </svg>
              </span>
            </a>
          </div>
        </section>

        <aside class="panel" aria-hidden="true">
          <div class="panel-bar">
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            <span class="panel-file">lesson.sql</span>
          </div>

          <pre class="code"><code><span class="k">SELECT</span> <span class="c">level</span>, <span class="c">title</span>, <span class="c">xp</span>
  <span class="k">FROM</span> <span class="t">lessons</span>
 <span class="k">WHERE</span> <span class="c">track</span> = <span class="s">'sql'</span>
<span class="k">ORDER BY</span> <span class="c">level</span> <span class="k">ASC</span><span class="p">;</span></code></pre>

          <ul class="feats">
            <li class="feat">
              <span class="feat-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m16 18 6-6-6-6" />
                  <path d="m8 6-6 6 6 6" />
                </svg>
              </span>
              <span class="feat-text">
                <span class="feat-name">Синтаксис SQL Server</span>
                <span class="feat-desc">ключи, типы, ошибки как в SSMS</span>
              </span>
            </li>
            <li class="feat">
              <span class="feat-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2c4.418 0 8 1.343 8 3s-3.582 3-8 3-8-1.343-8-3 3.582-3 8-3Z" />
                  <path d="M4 5v14c0 1.657 3.582 3 8 3s8-1.343 8-3V5" />
                  <path d="M4 12c0 1.657 3.582 3 8 3s8-1.343 8-3" />
                </svg>
              </span>
              <span class="feat-text">
                <span class="feat-name">Object Explorer</span>
                <span class="feat-desc">базы, таблицы и колонки</span>
              </span>
            </li>
            <li class="feat">
              <span class="feat-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
                  <line x1="6" x2="6.01" y1="16" y2="16" />
                  <line x1="10" x2="10.01" y1="16" y2="16" />
                </svg>
              </span>
              <span class="feat-text">
                <span class="feat-name">Данные остаются в браузере</span>
                <span class="feat-desc">локальное хранилище устройства</span>
              </span>
            </li>
          </ul>
        </aside>

      </div>

      <section class="games">
        <div class="games-head">
          <h2 class="games-title">Игры</h2>
          <p class="games-note">Проекты на Roblox</p>
        </div>
        <div class="games-grid">
          <GameCard
            v-for="game in games"
            :key="game.href"
            :href="game.href"
            :cover="game.cover"
            :name="game.name"
          />
        </div>
      </section>

      <footer class="foot">
        <span>klerr.dev</span>
        <span>SQL Trainer</span>
      </footer>
    </main>
  </div>
</template>

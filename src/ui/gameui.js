// DOM for the game layer: the campaign list and achievement seals on the
// Goals tab, the mission bar, briefing and result dialogs, and toasts.

import { CHALLENGES } from '../game/challenges.js';
import { ACHIEVEMENTS } from '../game/achievements.js';
import { incomePerDay } from '../game/game.js';
import { TICKS_PER_DAY } from '../sim/world.js';
import { esc } from './panels.js';

const $ = (id) => document.getElementById(id);
const STAR_PATH = 'M8 1.2l2.1 4.3 4.7.7-3.4 3.3.8 4.7L8 12l-4.2 2.2.8-4.7L1.2 6.2l4.7-.7z';

export function starSvg(on) {
  return `<svg viewBox="0 0 16 16" class="${on ? 'on' : ''}" aria-hidden="true"><path d="${STAR_PATH}" /></svg>`;
}

function starRow(n) {
  return `<span class="stars" role="img" aria-label="${n} of 3 stars">${[0, 1, 2].map((i) => starSvg(i < n)).join('')}</span>`;
}

// ------------------------------------------------------------------ goals tab

export function renderGoals(progress, currentId, onPlay) {
  const list = $('campaign');
  list.innerHTML = CHALLENGES.map((ch, i) => {
    const open = progress.unlocked(i);
    const stars = progress.stars[ch.id] ?? 0;
    return `<li class="${open ? '' : 'locked'} ${ch.id === currentId ? 'current' : ''}">
      <span class="ch-num">${i + 1}</span>
      <div>
        <h3>${esc(ch.title)}</h3>
        <p>${open ? esc(ch.goal) : 'Win the previous challenge to unlock.'}</p>
        ${starRow(stars)}
      </div>
      ${
        open
          ? `<button class="btn${stars ? '' : ' primary'}" type="button" data-play="${ch.id}">${ch.id === currentId ? 'Restart' : stars ? 'Replay' : 'Play'}</button>`
          : '<span class="sp-meta">Locked</span>'
      }
    </li>`;
  }).join('');
  for (const b of list.querySelectorAll('[data-play]')) b.addEventListener('click', () => onPlay(b.dataset.play));
  $('goals-stars').textContent = `${progress.totalStars} of ${CHALLENGES.length * 3} stars`;

  const earned = ACHIEVEMENTS.filter((a) => progress.achievements[a.id]).length;
  $('medals-count').textContent = `${earned} of ${ACHIEVEMENTS.length} earned`;
  $('medals').innerHTML = ACHIEVEMENTS.map((a) => {
    const got = progress.achievements[a.id];
    return `<li class="${got ? 'earned' : ''}" title="${got ? `Earned ${new Date(got).toLocaleDateString()}` : 'Not yet earned'}">
      <span class="seal" aria-hidden="true">${a.title[0]}</span>
      <span><b>${esc(a.title)}</b>${esc(a.desc)}</span>
    </li>`;
  }).join('');
}

// ------------------------------------------------------------------ mission bar

function fmt(p, v) {
  return p.decimals ? v.toFixed(p.decimals) : String(Math.round(v));
}

export function updateMission(game, world) {
  const bar = $('mission');
  const ch = game?.mode === 'challenge' ? game.challenge : null;
  bar.hidden = !ch;
  if (!ch) return;
  const index = CHALLENGES.indexOf(ch);
  $('m-count').textContent = `Challenge ${index + 1} of ${CHALLENGES.length}`;
  $('m-name').textContent = ch.title;
  $('m-goal').textContent = ch.goal;
  const p = game.progress(world);
  let frac;
  let text;
  if (p.countdown) {
    const start = game.ctx.startCount ?? Math.max(p.value, 1);
    frac = 1 - p.value / start;
    text = `${fmt(p, p.value)} ${p.label}`;
  } else {
    frac = p.value / p.target;
    text = `${fmt(p, p.value)} / ${fmt(p, p.target)} ${p.label}`;
  }
  $('m-fill').style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  const warnEl = $('m-progress');
  let danger = false;
  if (p.floor !== undefined) {
    const n = world.creatures.length;
    danger = n < p.floor * 1.4;
    text += ` · ${n} creatures, lose below ${p.floor}`;
  }
  const daysLeft = ch.deadline - world.tick / TICKS_PER_DAY;
  if (daysLeft < 3 && game.status === 'playing') danger = true;
  if (game.status === 'won') text = `Complete · ${game.stars} of 3 stars. Powers are free now.`;
  if (game.status === 'lost') text = 'Failed. Try again from the Goals tab.';
  if (game.status !== 'playing') danger = false;
  warnEl.textContent = text;
  warnEl.classList.toggle('warn', danger);
  bar.classList.toggle('danger', danger);
  $('m-day').textContent = (world.tick / TICKS_PER_DAY).toFixed(1);
  $('m-deadline').textContent = `deadline ${ch.deadline}`;
  $('m-nutrients').textContent = Math.floor(game.nutrients);
  $('m-income').textContent = `+${incomePerDay(world)}/day`;
}

// ------------------------------------------------------------------ dialogs

export function showBriefing(ch, { onBegin, onCancel }) {
  const index = CHALLENGES.indexOf(ch);
  $('briefing-count').textContent = `Challenge ${index + 1} of ${CHALLENGES.length}`;
  $('briefing-title').textContent = ch.title;
  $('briefing-brief').textContent = ch.brief;
  $('briefing-goal').textContent = ch.goal;
  $('briefing-deadline').textContent = `Deadline: day ${ch.deadline} · you start with ${ch.nutrients} nutrients`;
  $('briefing-stars').innerHTML = [
    `<li>${starSvg(true)}Complete the goal</li>`,
    ...ch.bonuses.map((b) => `<li>${starSvg(true)}${esc(b.label)}</li>`),
  ].join('');
  $('briefing-tips').innerHTML = ch.tips.map((t) => `<li>${esc(t)}</li>`).join('');
  $('briefing-begin').onclick = onBegin;
  $('briefing-cancel').onclick = onCancel;
  const dialog = $('briefing');
  dialog.oncancel = (e) => e.preventDefault();
  if (!dialog.open) dialog.showModal();
}

// While the pool warms up, Begin waits.
export function setBriefingReady(ready, pct = 100) {
  const b = $('briefing-begin');
  b.disabled = !ready;
  b.textContent = ready ? 'Begin' : `Preparing the pool… ${Math.round(pct)}%`;
}

export function closeBriefing() {
  if ($('briefing').open) $('briefing').close();
}

export function showResult(game, world, { improved, actions }) {
  const ch = game.challenge;
  const won = game.status === 'won';
  $('result-stars').innerHTML = [0, 1, 2].map((i) => starSvg(i < game.stars)).join('');
  $('result-title').textContent = won ? `${ch.title}: complete` : `${ch.title}: failed`;
  const day = game.endDay.toFixed(1);
  $('result-summary').textContent = won
    ? `Done on day ${day}, having spent ${Math.round(game.spent)} nutrients.${improved ? ' A new personal best.' : ''}`
    : lossReason(ch, game, world);
  $('result-bonuses').innerHTML = won
    ? [
        `<li>${starSvg(true)}Complete the goal</li>`,
        ...ch.bonuses.map((b, i) => `<li class="${game.bonusResults[i] ? '' : 'missed'}">${starSvg(game.bonusResults[i])}${esc(b.label)}</li>`),
      ].join('')
    : '';
  const box = $('result-actions');
  box.innerHTML = actions
    .map((a, i) => `<button class="btn${i === 0 ? ' primary' : ''}" type="button" data-i="${i}">${esc(a.label)}</button>`)
    .join('');
  const dialog = $('result');
  for (const b of box.querySelectorAll('button')) {
    b.addEventListener('click', () => {
      dialog.close();
      actions[Number(b.dataset.i)].run();
    });
  }
  dialog.oncancel = (e) => e.preventDefault();
  dialog.showModal();
}

function lossReason(ch, game, world) {
  const day = game.endDay.toFixed(1);
  if (game.endDay >= ch.deadline) return `Day ${ch.deadline} came and the goal was not met. Evolution is patient; deadlines are not.`;
  if (ch.id === 'long-winter') return `On day ${day} the population fell below 30. The pool will not recover in time.`;
  if (ch.id === 'invasion') return `On day ${day} too few native species remained. The invaders have the pool.`;
  return `The attempt ended on day ${day}.`;
}

// ------------------------------------------------------------------ toasts

export function toast(html, { achievement = false, ms = 4200 } = {}) {
  const holder = $('toasts');
  const el = document.createElement('div');
  el.className = `toast${achievement ? '' : ' plain'}`;
  el.innerHTML = html;
  holder.appendChild(el);
  while (holder.children.length > 3) holder.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 450);
  }, ms);
}

export function achievementToast(a) {
  toast(
    `<span class="seal" aria-hidden="true">${a.title[0]}</span>
     <span><span class="eyebrow">Achievement unlocked</span><b>${esc(a.title)}</b>${esc(a.desc)}</span>`,
    { achievement: true, ms: 5200 },
  );
}

// 다크 모드 토글
// 초기 테마는 index.html <head>의 인라인 스크립트가 먼저 적용합니다.

const STORAGE_KEY = 'theme';
const root = document.documentElement;
const media = window.matchMedia('(prefers-color-scheme: dark)');
const button = document.querySelector('.theme-toggle');
const icon = button?.querySelector('.theme-icon');

function currentTheme() {
  const explicit = root.dataset.theme;
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return media.matches ? 'dark' : 'light';
}

function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* 저장할 수 없어도 현재 화면에는 적용됩니다 */
  }
}

function updateButton() {
  if (!button) return;
  const isDark = currentTheme() === 'dark';
  // 버튼은 "누르면 바뀔 모드"를 보여줍니다.
  if (icon) icon.textContent = isDark ? '☀' : '☾';
  button.setAttribute('aria-label', isDark ? '라이트 모드로 전환' : '다크 모드로 전환');
  button.title = isDark ? '라이트 모드' : '다크 모드';
}

button?.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  saveTheme(next);
  updateButton();
});

// 사용자가 직접 고르지 않았다면 OS 설정 변경을 따라갑니다.
media.addEventListener('change', updateButton);

updateButton();

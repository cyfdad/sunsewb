document.addEventListener("DOMContentLoaded", function() {
  const themeToggle = document.getElementById("themeToggle");
  const html = document.documentElement;
  
  const themes = {
    light: {
      name: "日间模式",
      icon: "sunny"
    },
    dark: {
      name: "夜间模式", 
      icon: "moon"
    }
  };

  let currentTheme = "light";

  function initTheme() {
    const savedTheme = localStorage.getItem("siteTheme");
    
    if (savedTheme) {
      currentTheme = savedTheme;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      currentTheme = "dark";
    }

    applyTheme(currentTheme, false);
  }

  function applyTheme(theme, animate = true) {
    currentTheme = theme;

    if (theme === "dark") {
      html.setAttribute("data-theme", "dark");
      themeToggle.classList.add("dark");
    } else {
      html.removeAttribute("data-theme");
      themeToggle.classList.remove("dark");
    }

    localStorage.setItem("siteTheme", theme);

    window.dispatchEvent(new CustomEvent("themeChange", { 
      detail: { theme: theme } 
    }));

    if (animate) {
      createRippleEffect();
    }
  }

  function toggleTheme() {
    const newTheme = currentTheme === "light" ? "dark" : "light";
    applyTheme(newTheme);
  }

  function createRippleEffect() {
    const ripple = document.createElement("div");
    ripple.className = "theme-ripple";
    
    const rect = themeToggle.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    
    ripple.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: ${currentTheme === "dark" 
        ? "radial-gradient(circle, rgba(13,17,23,0.3) 0%, transparent 70%)" 
        : "radial-gradient(circle, rgba(245,255,247,0.3) 0%, transparent 70%)"};
      transform: translate(-50%, -50%) scale(0);
      pointer-events: none;
      z-index: 9999;
      animation: themeRipple 0.8s ease-out forwards;
    `;
    
    document.body.appendChild(ripple);
    
    setTimeout(() => {
      ripple.remove();
    }, 800);
  }

  const style = document.createElement("style");
  style.textContent = `
    @keyframes themeRipple {
      0% {
        transform: translate(-50%, -50%) scale(0);
        opacity: 1;
      }
      100% {
        transform: translate(-50%, -50%) scale(200);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
  themeToggle.addEventListener("click", toggleTheme);

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (!localStorage.getItem("siteTheme")) {
        applyTheme(e.matches ? "dark" : "light");
      }
    });
  }

  document.addEventListener("keydown", function(e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d") {
      e.preventDefault();
      toggleTheme();
    }
  });

  initTheme();

  window.ThemeToggle = {
    toggle: toggleTheme,
    setTheme: applyTheme,
    getTheme: () => currentTheme,
    isDark: () => currentTheme === "dark"
  };
});
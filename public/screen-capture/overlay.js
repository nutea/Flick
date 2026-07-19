(() => {
  const bridge = window.screenCaptureOverlay;
  const overlay = document.getElementById('overlay');
  const selection = document.getElementById('selection');
  const size = document.getElementById('size');
  const hint = document.getElementById('hint');

  let token = '';
  let display = null;
  let origin = null;
  let current = null;
  let completing = false;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const pointFromEvent = (event) => ({
    x: clamp(Math.round(event.clientX), 0, window.innerWidth),
    y: clamp(Math.round(event.clientY), 0, window.innerHeight),
  });

  const getRect = () => {
    if (!origin || !current) return null;
    const x = Math.min(origin.x, current.x);
    const y = Math.min(origin.y, current.y);
    return {
      x,
      y,
      width: Math.abs(current.x - origin.x),
      height: Math.abs(current.y - origin.y),
    };
  };

  const render = () => {
    const rect = getRect();
    if (!rect) return;
    selection.hidden = false;
    selection.style.left = `${rect.x}px`;
    selection.style.top = `${rect.y}px`;
    selection.style.width = `${rect.width}px`;
    selection.style.height = `${rect.height}px`;
    selection.classList.toggle('near-top', rect.y < 42);
    size.textContent = `${rect.width} × ${rect.height}`;
  };

  const cancel = () => {
    if (!token || completing) return;
    completing = true;
    bridge.cancel(token);
  };

  bridge.onInit((payload) => {
    token = payload.token;
    display = payload.display;
  });

  overlay.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || completing || !display) return;
    origin = pointFromEvent(event);
    current = origin;
    overlay.classList.add('selecting');
    hint.hidden = true;
    overlay.setPointerCapture(event.pointerId);
    render();
  });

  overlay.addEventListener('pointermove', (event) => {
    if (!origin || completing) return;
    current = pointFromEvent(event);
    render();
  });

  overlay.addEventListener('pointerup', (event) => {
    if (event.button !== 0 || !origin || completing || !display) return;
    current = pointFromEvent(event);
    const rect = getRect();
    if (!rect || rect.width < 2 || rect.height < 2) {
      origin = null;
      current = null;
      selection.hidden = true;
      overlay.classList.remove('selecting');
      hint.hidden = false;
      return;
    }

    completing = true;
    bridge.complete({
      token,
      x: display.x + rect.x,
      y: display.y + rect.y,
      width: rect.width,
      height: rect.height,
    });
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') cancel();
  });
  window.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    cancel();
  });
})();

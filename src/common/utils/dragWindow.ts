const { ipcRenderer } = window.require('electron');

/** 超过该平方距离后才视为拖动，避免点击/输入时 mousedown 立刻触发 windowMoving 导致窗口跳动 */
const DRAG_THRESHOLD_SQ = 9;

const useDrag = () => {
  let animationId = 0;
  let mouseX = 0;
  let mouseY = 0;
  let clientWidth = 0;
  let clientHeight = 0;
  let dragging = false;

  const moveWindow = () => {
    ipcRenderer.send('msg-trigger', {
      type: 'windowMoving',
      data: { mouseX, mouseY, width: clientWidth, height: clientHeight },
    });
    if (dragging) animationId = requestAnimationFrame(moveWindow);
  };

  const onMouseUp = () => {
    dragging = false;
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('mousemove', onMouseMove);
    cancelAnimationFrame(animationId);
  };

  const onMouseMove = (e: MouseEvent) => {
    const dx = e.clientX - mouseX;
    const dy = e.clientY - mouseY;
    if (!dragging) {
      if (dx * dx + dy * dy < DRAG_THRESHOLD_SQ) return;
      dragging = true;
      clientWidth = document.body.clientWidth;
      clientHeight = document.body.clientHeight;
      animationId = requestAnimationFrame(moveWindow);
    }
  };

  const onMouseDown = (e: MouseEvent) => {
    if (e.button === 2) return;
    mouseX = e.clientX;
    mouseY = e.clientY;
    dragging = false;
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousemove', onMouseMove);
  };

  return {
    onMouseDown,
  };
};

export default useDrag;

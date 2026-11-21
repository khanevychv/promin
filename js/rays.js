// =========================================
// WebGL-промені (бонус)
// =========================================
function startRays(container) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');
  if (!gl) return; // WebGL недоступний: лишаються CSS-промені

  container.appendChild(canvas);
  container.classList.add('is-webgl');

  // --- 1. Шейдери: програми для відеокарти ---
  const vertexSource = `
    attribute vec2 position;

    void main() {
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision highp float;

    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uMouseX;
    uniform vec3 uColor;

    void main() {
      // Координати пікселя: (0, 0) у верхньому центрі, 1 = висота екрана
      vec2 p = (gl_FragCoord.xy - vec2(0.5 * uResolution.x, uResolution.y)) / uResolution.y;

      // Джерело світла над екраном, трохи зсувається за курсором
      vec2 origin = vec2((uMouseX - 0.5) * 0.4, 0.3);
      vec2 dir = p - origin;
      float angle = atan(dir.x, -dir.y); // 0 = прямо вниз
      float dist = length(dir);

      // Промені: три хвилі різної частоти, що повільно рухаються
      float rays = sin(angle * 23.0 + uTime * 0.35)
                 + sin(angle * 41.0 - uTime * 0.25 + 1.7)
                 + sin(angle * 67.0 + uTime * 0.45 + 4.2);
      rays = rays / 6.0 + 0.5;  // переводимо в діапазон 0..1
      rays = pow(rays, 4.0);    // робимо промені тоншими

      // Мерехтіння вздовж променя, ніби пил у світлі
      rays *= 0.75 + 0.25 * sin(dist * 9.0 - uTime * 0.8);

      // Конус: світло лише в межах ±50° від вертикалі
      float cone = smoothstep(0.9, 0.0, abs(angle));

      // Згасання з відстанню і сяйво біля джерела
      float fade = exp(-dist * 1.5);
      float glow = exp(-dist * 5.0) * 0.9;

      float light = clamp((rays * cone * 1.6 + glow) * fade, 0.0, 1.0);
      gl_FragColor = vec4(uColor * light, light);
    }
  `;

  function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  const program = gl.createProgram();
  gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  gl.useProgram(program);

  // --- 2. Прямокутник на весь canvas (два трикутники) ---
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  // --- 3. Змінні, які JS передає в шейдер ---
  const uResolution = gl.getUniformLocation(program, 'uResolution');
  const uTime = gl.getUniformLocation(program, 'uTime');
  const uMouseX = gl.getUniformLocation(program, 'uMouseX');
  const uColor = gl.getUniformLocation(program, 'uColor');
  gl.uniform3f(uColor, 255 / 255, 236 / 255, 205 / 255); // наш --color-light

  // --- 4. Розмір: промені розмиті, тож малюємо в половинній роздільності ---
  const QUALITY = 0.5;

  function resize() {
    canvas.width = Math.round(container.clientWidth * QUALITY);
    canvas.height = Math.round(container.clientHeight * QUALITY);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uResolution, canvas.width, canvas.height);
  }

  resize();
  window.addEventListener('resize', resize);

  // --- 5. Курсор: джерело світла плавно тягнеться за ним ---
  let mouseX = 0.5;
  let targetX = 0.5;

  window.addEventListener('pointermove', (event) => {
    targetX = event.clientX / window.innerWidth;
  });

  // --- 6. Анімація: малюємо кадр за кадром ---
  let frameId = null;

  function draw(time) {
    mouseX += (targetX - mouseX) * 0.05;
    gl.uniform1f(uTime, time / 1000);
    gl.uniform1f(uMouseX, mouseX);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    frameId = requestAnimationFrame(draw);
  }

  // Малюємо лише тоді, коли перший екран видно
  const raysObserver = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && frameId === null) {
      frameId = requestAnimationFrame(draw);
    } else if (!entry.isIntersecting && frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  });

  raysObserver.observe(container);
}

document.querySelectorAll('.rays').forEach(startRays);
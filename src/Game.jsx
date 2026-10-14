import { useEffect, useRef, useState, useCallback } from 'react';
import './Game.css';

const GAME_WIDTH = 800;
const GAME_HEIGHT = 400;
const GROUND_Y = GAME_HEIGHT - 80;
const GRAVITY = 0.8;
const JUMP_FORCE = -18;
const GAME_SPEED = 6;
const HEALTH_DECAY_RATE = 0.03; // per frame at 60fps ~ 1.8/sec
const OBSTACLE_SPAWN_INTERVAL = 1500; // ms

function Game() {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const lastTimeRef = useRef(0);
  const obstacleTimerRef = useRef(0);
  const keysRef = useRef({ ArrowUp: false, ArrowDown: false, Space: false });

  const [gameState, setGameState] = useState('start'); // start, playing, gameover
  const [health, setHealth] = useState(100);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => 
    parseInt(localStorage.getItem('cookieRunHighScore') || '0', 10)
  );

  // Player state
  const playerRef = useRef({
    x: 100,
    y: GROUND_Y,
    velocityY: 0,
    height: 60,
    width: 40,
    isJumping: false,
    isSliding: false,
    slideTimer: 0,
    animationFrame: 0,
    animationTimer: 0,
  });

  // Obstacles array
  const obstaclesRef = useRef([]);

  // Game speed (increases over time)
  const gameSpeedRef = useRef(GAME_SPEED);

  // Get canvas context
  const getCtx = useCallback(() => canvasRef.current?.getContext('2d'), []);

  // Reset game
  const resetGame = useCallback(() => {
    // Cancel any pending animation frame
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    // Clear all obstacles completely
    obstaclesRef.current = [];
    
    // Reset player state
    playerRef.current = {
      x: 100,
      y: GROUND_Y,
      velocityY: 0,
      height: 60,
      width: 40,
      isJumping: false,
      isSliding: false,
      slideTimer: 0,
      animationFrame: 0,
      animationTimer: 0,
    };
    
    // Reset all game variables
    gameSpeedRef.current = GAME_SPEED;
    obstacleTimerRef.current = 0;
    lastTimeRef.current = 0;
    keysRef.current = { ArrowUp: false, ArrowDown: false, Space: false };
    
    // Reset React state
    setHealth(100);
    setScore(0);
    setGameState('playing');
  }, []);

  // Spawn obstacle
  const spawnObstacle = useCallback(() => {
    const types = ['low', 'high', 'double'];
    const type = types[Math.floor(Math.random() * types.length)];
    let height, width, y, gap = 0;

    switch (type) {
      case 'low': // Jump over
        height = 50;
        width = 40;
        y = GROUND_Y;
        break;
      case 'high': // Slide under
        height = 120;
        width = 40;
        y = GROUND_Y - 70;
        break;
      case 'double': // Jump or slide (gap in middle)
        height = 50;
        width = 60;
        y = GROUND_Y;
        gap = 70;
        break;
    }

    obstaclesRef.current.push({
      x: GAME_WIDTH + 50,
      y,
      width,
      height,
      type,
      gap,
      passed: false,
      color: `hsl(${Math.random() * 60 + 10}, 70%, 50%)`, // Warm cookie colors
    });
  }, []);

  // Check collision
  const checkCollision = useCallback((player, obstacle) => {
    const playerLeft = player.x;
    const playerRight = player.x + player.width;
    const playerTop = player.y;
    const playerBottom = player.y + player.height;

    const obsLeft = obstacle.x;
    const obsRight = obstacle.x + obstacle.width;
    const obsTop = obstacle.y;
    const obsBottom = obstacle.y + obstacle.height;

    // Basic AABB collision
    if (playerRight < obsLeft || playerLeft > obsRight ||
        playerBottom < obsTop || playerTop > obsBottom) {
      return false;
    }

    // For double obstacle, check if player goes through gap
    if (obstacle.type === 'double' && obstacle.gap > 0) {
      const gapTop = obstacle.y;
      const gapBottom = obstacle.y + obstacle.gap;
      // Player passes through gap vertically
      if (playerBottom <= gapTop || playerTop >= gapBottom) {
        return true; // Hit the solid part
      }
      return false; // Passed through gap
    }

    return true;
  }, []);

  // Game loop
  const gameLoop = useCallback((timestamp) => {
    if (gameState !== 'playing') return;

    const dt = timestamp - (lastTimeRef.current || timestamp);
    lastTimeRef.current = timestamp;

    const ctx = getCtx();
    if (!ctx) return;

    const player = playerRef.current;
    const canvas = canvasRef.current;

    // Clear canvas
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Handle input
    if ((keysRef.current.ArrowUp || keysRef.current.Space) && !player.isJumping && !player.isSliding) {
      player.velocityY = JUMP_FORCE;
      player.isJumping = true;
    }
    if (keysRef.current.ArrowDown && !player.isSliding && !player.isJumping) {
      player.isSliding = true;
      player.slideTimer = 300; // ms
      player.height = 30;
      player.y = GROUND_Y + 30;
    }

    // Update slide timer
    if (player.isSliding) {
      player.slideTimer -= dt;
      if (player.slideTimer <= 0) {
        player.isSliding = false;
        player.height = 60;
        player.y = GROUND_Y;
      }
    }

    // Apply gravity
    if (player.isJumping) {
      player.velocityY += GRAVITY;
      player.y += player.velocityY;

      if (player.y >= GROUND_Y) {
        player.y = GROUND_Y;
        player.velocityY = 0;
        player.isJumping = false;
      }
    }

    // Animation frame for running
    player.animationTimer += dt;
    if (player.animationTimer > 100) {
      player.animationFrame = (player.animationFrame + 1) % 4;
      player.animationTimer = 0;
    }

    // Spawn obstacles
    obstacleTimerRef.current += dt;
    if (obstacleTimerRef.current > OBSTACLE_SPAWN_INTERVAL) {
      spawnObstacle();
      obstacleTimerRef.current = 0;
      // Increase difficulty over time
      gameSpeedRef.current = Math.min(GAME_SPEED + score * 0.02, 15);
    }

    // Update obstacles
    for (let i = obstaclesRef.current.length - 1; i >= 0; i--) {
      const obs = obstaclesRef.current[i];
      obs.x -= gameSpeedRef.current;

      // Check collision
      if (checkCollision(player, obs)) {
        setHealth(h => {
          const newHealth = h - 15;
          if (newHealth <= 0) {
            setGameState('gameover');
            // Clear all obstacles on gameover
            obstaclesRef.current = [];
            if (score > highScore) {
              setHighScore(score);
              localStorage.setItem('cookieRunHighScore', score.toString());
            }
            return 0;
          }
          return newHealth;
        });
        // Remove obstacle on hit so player doesn't get hit multiple times
        obstaclesRef.current.splice(i, 1);
        continue;
      }

      // Score when passing obstacle
      if (!obs.passed && obs.x + obs.width < player.x) {
        obs.passed = true;
        setScore(s => s + 10);
      }

      // Remove off-screen obstacles
      if (obs.x + obs.width < 0) {
        obstaclesRef.current.splice(i, 1);
      }
    }

    // Decay health over time
    setHealth(h => Math.max(0, h - HEALTH_DECAY_RATE));

    // Draw background (parallax layers)
    drawBackground(ctx, timestamp);
    drawGround(ctx);
    drawPlayer(ctx, player, timestamp);
    drawObstacles(ctx, obstaclesRef.current);
    drawUI(ctx, health, score, highScore);

    animationRef.current = requestAnimationFrame(gameLoop);
  }, [gameState, getCtx, score, highScore, spawnObstacle, checkCollision]);

  // Start game loop when playing
  useEffect(() => {
    if (gameState === 'playing') {
      lastTimeRef.current = performance.now();
      animationRef.current = requestAnimationFrame(gameLoop);
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [gameState, gameLoop]);

  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
        e.preventDefault();
        keysRef.current[e.code] = true;
      }
      if (e.code === 'Enter' && gameState !== 'playing') {
        resetGame();
      }
    };
    const handleKeyUp = (e) => {
      if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
        keysRef.current[e.code] = false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, resetGame]);

  // Touch handlers for mobile
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let touchStartY = 0;

    const handleTouchStart = (e) => {
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchEnd = (e) => {
      const touchEndY = e.changedTouches[0].clientY;
      const diff = touchStartY - touchEndY;
      if (Math.abs(diff) > 30) {
        if (diff > 0) { // Swipe up - jump
          keysRef.current.ArrowUp = true;
          setTimeout(() => keysRef.current.ArrowUp = false, 100);
        } else { // Swipe down - slide
          keysRef.current.ArrowDown = true;
          setTimeout(() => keysRef.current.ArrowDown = false, 300);
        }
      } else {
        // Tap - jump
        keysRef.current.Space = true;
        setTimeout(() => keysRef.current.Space = false, 100);
      }
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  return (
    <div className="game-container">
      <div className="game-header">
        <h1>🍪 쿠키런: 장애물 러너</h1>
        <div className="stats">
          <div className="stat">
            <span className="label">점수</span>
            <span className="value">{score}</span>
          </div>
          <div className="stat">
            <span className="label">최고</span>
            <span className="value">{highScore}</span>
          </div>
        </div>
      </div>

      <div className="health-bar-container">
        <div className="health-bar-bg">
          <div 
            className="health-bar-fill" 
            style={{ width: `${health}%` }}
          ></div>
        </div>
        <span className="health-text">{Math.ceil(health)}%</span>
      </div>

      <canvas
        ref={canvasRef}
        width={GAME_WIDTH}
        height={GAME_HEIGHT}
        className="game-canvas"
        tabIndex={0}
      />

      <div className="controls-hint">
        <kbd>↑</kbd> / <kbd>Space</kbd> 점프 &nbsp;|&nbsp; 
        <kbd>↓</kbd> 슬라이딩 &nbsp;|&nbsp; 
        <kbd>Enter</kbd> 재시작
      </div>

      {gameState === 'start' && (
        <div className="overlay start-overlay">
          <h2>게임 시작</h2>
          <p>장애물을 피해 최대한 멀리 달려보세요!</p>
          <p>체력이 0이 되면 게임 오버</p>
          <button onClick={resetGame}>시작하기 (Enter)</button>
        </div>
      )}

      {gameState === 'gameover' && (
        <div className="overlay gameover-overlay">
          <h2>게임 오버</h2>
          <p>최종 점수: <strong>{score}</strong></p>
          <p>최고 기록: <strong>{highScore}</strong></p>
          <button onClick={resetGame}>다시 하기 (Enter)</button>
        </div>
      )}
    </div>
  );
}

// Drawing functions
function drawBackground(ctx, timestamp) {
  // Sky gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  gradient.addColorStop(0, '#87CEEB');
  gradient.addColorStop(0.5, '#E0F7FA');
  gradient.addColorStop(1, '#FFF8E1');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // Clouds (parallax)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  for (let i = 0; i < 5; i++) {
    const x = ((timestamp * 0.02) + i * 200) % (GAME_WIDTH + 100) - 50;
    const y = 50 + i * 40;
    drawCloud(ctx, x, y, 60 + i * 10);
  }

  // Far mountains
  ctx.fillStyle = 'rgba(139, 195, 74, 0.3)';
  for (let i = 0; i < 4; i++) {
    const x = ((timestamp * 0.05) + i * 250) % (GAME_WIDTH + 150) - 75;
    drawMountain(ctx, x, GROUND_Y - 50, 150, 100);
  }
}

function drawCloud(ctx, x, y, size) {
  ctx.beginPath();
  ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
  ctx.arc(x + size * 0.4, y - size * 0.2, size * 0.4, 0, Math.PI * 2);
  ctx.arc(x + size * 0.8, y, size * 0.5, 0, Math.PI * 2);
  ctx.arc(x + size * 0.4, y + size * 0.15, size * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

function drawMountain(ctx, x, y, width, height) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width / 2, y - height);
  ctx.lineTo(x + width, y);
  ctx.closePath();
  ctx.fill();
}

function drawGround(ctx) {
  // Ground
  const groundGradient = ctx.createLinearGradient(0, GROUND_Y, 0, GAME_HEIGHT);
  groundGradient.addColorStop(0, '#8D6E63');
  groundGradient.addColorStop(0.3, '#6D4C41');
  groundGradient.addColorStop(1, '#4E342E');
  ctx.fillStyle = groundGradient;
  ctx.fillRect(0, GROUND_Y, GAME_WIDTH, GAME_HEIGHT - GROUND_Y);

  // Grass line
  ctx.fillStyle = '#4CAF50';
  ctx.fillRect(0, GROUND_Y, GAME_WIDTH, 4);

  // Ground pattern
  ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
  for (let x = -50; x < GAME_WIDTH + 50; x += 40) {
    ctx.beginPath();
    ctx.arc(x, GROUND_Y + 20, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer(ctx, player, timestamp) {
  const { x, y, width, height, isJumping, isSliding, animationFrame } = player;
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  ctx.save();
  ctx.translate(centerX, centerY);

  // Body (cookie)
  const bodyGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, width / 2);
  bodyGradient.addColorStop(0, '#D7A86E');
  bodyGradient.addColorStop(0.7, '#C49A6C');
  bodyGradient.addColorStop(1, '#A0785A');
  ctx.fillStyle = bodyGradient;

  // Body shape
  ctx.beginPath();
  if (isSliding) {
    // Flattened sliding shape
    ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.ellipse(0, 0, width / 2, height / 2 - 5, 0, 0, Math.PI * 2);
  }
  ctx.fill();

  // Chocolate chips
  ctx.fillStyle = '#3E2723';
  const chipPositions = [
    [-8, -5], [8, -8], [-5, 8], [10, 5], [0, 10]
  ];
  chipPositions.forEach(([cx, cy]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Eyes
  const eyeY = isSliding ? -5 : -8;
  const eyeBlink = Math.sin(timestamp * 0.005) > 0.95;
  
  if (!eyeBlink) {
    // Left eye
    ctx.fillStyle = '#212121';
    ctx.beginPath();
    ctx.arc(-10, eyeY, 5, 0, Math.PI * 2);
    ctx.fill();
    // Right eye
    ctx.beginPath();
    ctx.arc(10, eyeY, 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Pupils
    ctx.fillStyle = '#FFFFFF';
    const pupilOffset = isJumping ? 0 : Math.sin(timestamp * 0.003) * 1.5;
    ctx.beginPath();
    ctx.arc(-10 + pupilOffset, eyeY - 1, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(10 + pupilOffset, eyeY - 1, 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Blinking - just lines
    ctx.strokeStyle = '#212121';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-15, eyeY);
    ctx.lineTo(-5, eyeY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(5, eyeY);
    ctx.lineTo(15, eyeY);
    ctx.stroke();
  }

  // Mouth
  ctx.strokeStyle = '#3E2723';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  if (isJumping) {
    // Happy mouth when jumping
    ctx.beginPath();
    ctx.arc(0, 8, 8, 0, Math.PI);
    ctx.stroke();
  } else if (isSliding) {
    // Determined mouth when sliding
    ctx.beginPath();
    ctx.moveTo(-6, 5);
    ctx.lineTo(6, 5);
    ctx.stroke();
  } else {
    // Normal smile with animation
    const smileWidth = 6 + Math.sin(timestamp * 0.01) * 2;
    ctx.beginPath();
    ctx.arc(0, 8, smileWidth, 0, Math.PI);
    ctx.stroke();
  }

  // Legs animation when running
  if (!isJumping && !isSliding) {
    const legOffset = Math.sin(animationFrame * Math.PI / 2) * 8;
    ctx.strokeStyle = '#A0785A';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    // Left leg
    ctx.beginPath();
    ctx.moveTo(-10, height / 2 - 5);
    ctx.lineTo(-10 + legOffset, height / 2 + 15);
    ctx.stroke();
    // Right leg
    ctx.beginPath();
    ctx.moveTo(10, height / 2 - 5);
    ctx.lineTo(10 - legOffset, height / 2 + 15);
    ctx.stroke();
  } else if (isJumping) {
    // Legs tucked when jumping
    ctx.strokeStyle = '#A0785A';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-10, height / 2 - 5);
    ctx.lineTo(-5, height / 2 + 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(10, height / 2 - 5);
    ctx.lineTo(5, height / 2 + 5);
    ctx.stroke();
  }

  ctx.restore();
}

function drawObstacles(ctx, obstacles) {
  obstacles.forEach(obs => {
    ctx.save();
    
    // Obstacle gradient
    const grad = ctx.createLinearGradient(obs.x, obs.y, obs.x + obs.width, obs.y + obs.height);
    grad.addColorStop(0, obs.color);
    const darkerColor = obs.color.replace('50%', '35%');
    grad.addColorStop(1, darkerColor);
    ctx.fillStyle = grad;

    if (obs.type === 'double' && obs.gap > 0) {
      // Top part
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      // Bottom part
      ctx.fillRect(obs.x, obs.y + obs.height + obs.gap, obs.width, GAME_HEIGHT - (obs.y + obs.height + obs.gap));
      
      // Gap indicator (arrows)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('↓ 통과 ↓', obs.x + obs.width / 2, obs.y + obs.height + obs.gap / 2 + 5);
    } else {
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      
      // Type indicator
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      if (obs.type === 'low') {
        ctx.fillText('점프! ↑', obs.x + obs.width / 2, obs.y - 5);
      } else if (obs.type === 'high') {
        ctx.fillText('슬라이드! ↓', obs.x + obs.width / 2, obs.y + obs.height + 20);
      }
    }

    // Highlight edges for 3D effect
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);

    ctx.restore();
  });
}

function drawUI(ctx, health, score, highScore) {
  // Mini score display on canvas (backup)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`점수: ${score}`, 20, 35);
  ctx.fillText(`최고: ${highScore}`, 20, 60);
}

export default Game;
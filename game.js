console.log('=== SIMPLE BALL BOUNCER GAME ===');

class SimpleBallBouncerGame {
    constructor() {
        console.log('Creating simple ball bouncer game...');
        
        this.canvas = null;
        this.ctx = null;
        this.balls = [];
        this.isRunning = false;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        
        this.statusElement = document.getElementById('status');
        this.enterVRButton = document.getElementById('enterVR');
        
        if (!this.statusElement || !this.enterVRButton) {
            console.error('Required DOM elements not found!');
            return;
        }
        
        this.init();
    }
    
    init() {
        console.log('Initializing canvas game...');
        this.updateStatus('Initialisiere Canvas...');
        
        try {
            this.setupCanvas();
            this.setupControls();
            this.start();
            
            this.updateStatus('Bereit! Klicke zum Werfen oder drücke Leertaste');
            
        } catch (error) {
            this.updateStatus('Fehler: ' + error.message);
            console.error('Initialisierungsfehler:', error);
        }
    }
    
    setupCanvas() {
        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.zIndex = '1';
        this.canvas.style.background = 'radial-gradient(circle, #1a1a2e 0%, #000000 100%)';
        
        document.body.appendChild(this.canvas);
        
        this.ctx = this.canvas.getContext('2d');
        
        // Handle resize
        window.addEventListener('resize', () => {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            this.canvas.width = this.width;
            this.canvas.height = this.height;
        });
        
        console.log('Canvas created:', this.width, 'x', this.height);
    }
    
    setupControls() {
        // Button click
        this.enterVRButton.textContent = 'Ball werfen!';
        this.enterVRButton.disabled = false;
        this.enterVRButton.addEventListener('click', () => this.shootBall());
        
        // Canvas click
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            this.shootBallAt(x, y);
        });
        
        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.shootBall();
            }
        });
        
        console.log('Controls setup complete');
    }
    
    shootBall() {
        // Shoot from random position at top
        const x = Math.random() * (this.width - 100) + 50;
        this.shootBallAt(x, 50);
    }
    
    shootBallAt(x, y) {
        const ball = {
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 10, // Random horizontal velocity
            vy: Math.random() * 5 + 2,      // Downward velocity
            radius: Math.random() * 15 + 10, // Random size
            color: this.getRandomColor(),
            bounce: 0.8,                     // Bounce damping
            gravity: 0.5,                    // Gravity strength
            created: Date.now()
        };
        
        this.balls.push(ball);
        console.log('Ball shot at', x, y);
        
        // Remove old balls (keep only last 30)
        if (this.balls.length > 30) {
            this.balls.shift();
        }
    }
    
    getRandomColor() {
        const colors = [
            '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', 
            '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd',
            '#00d2d3', '#ff9f43', '#c44569', '#f8b500'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    updateBalls() {
        for (let i = this.balls.length - 1; i >= 0; i--) {
            const ball = this.balls[i];
            
            // Apply gravity
            ball.vy += ball.gravity;
            
            // Update position
            ball.x += ball.vx;
            ball.y += ball.vy;
            
            // Wall collision (left/right)
            if (ball.x - ball.radius <= 0 || ball.x + ball.radius >= this.width) {
                ball.vx *= -ball.bounce;
                ball.x = Math.max(ball.radius, Math.min(this.width - ball.radius, ball.x));
            }
            
            // Floor collision
            if (ball.y + ball.radius >= this.height) {
                ball.vy *= -ball.bounce;
                ball.y = this.height - ball.radius;
                
                // Stop very small bounces
                if (Math.abs(ball.vy) < 1) {
                    ball.vy = 0;
                }
            }
            
            // Ceiling collision
            if (ball.y - ball.radius <= 0) {
                ball.vy *= -ball.bounce;
                ball.y = ball.radius;
            }
            
            // Add friction when on ground
            if (ball.y + ball.radius >= this.height - 1) {
                ball.vx *= 0.99;
            }
            
            // Remove balls that are too old or have stopped moving
            const age = Date.now() - ball.created;
            const isMoving = Math.abs(ball.vx) > 0.1 || Math.abs(ball.vy) > 0.1;
            
            if (age > 20000 || (!isMoving && ball.y + ball.radius >= this.height - 1)) {
                this.balls.splice(i, 1);
            }
        }
    }
    
    render() {
        // Clear canvas with gradient effect
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Draw balls
        this.balls.forEach(ball => {
            this.ctx.save();
            
            // Shadow
            this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            this.ctx.shadowBlur = 10;
            this.ctx.shadowOffsetX = 3;
            this.ctx.shadowOffsetY = 3;
            
            // Ball gradient
            const gradient = this.ctx.createRadialGradient(
                ball.x - ball.radius * 0.3, 
                ball.y - ball.radius * 0.3, 
                0,
                ball.x, 
                ball.y, 
                ball.radius
            );
            gradient.addColorStop(0, ball.color);
            gradient.addColorStop(1, this.darkenColor(ball.color, 0.3));
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Highlight
            this.ctx.shadowColor = 'transparent';
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.beginPath();
            this.ctx.arc(
                ball.x - ball.radius * 0.3, 
                ball.y - ball.radius * 0.3, 
                ball.radius * 0.3, 
                0, Math.PI * 2
            );
            this.ctx.fill();
            
            this.ctx.restore();
        });
        
        // Draw info
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.font = '16px Arial';
        this.ctx.fillText(`Bälle: ${this.balls.length}`, 20, this.height - 30);
    }
    
    darkenColor(color, amount) {
        const hex = color.replace('#', '');
        const r = Math.max(0, parseInt(hex.substr(0, 2), 16) * (1 - amount));
        const g = Math.max(0, parseInt(hex.substr(2, 2), 16) * (1 - amount));
        const b = Math.max(0, parseInt(hex.substr(4, 2), 16) * (1 - amount));
        return `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
    }
    
    start() {
        this.isRunning = true;
        this.gameLoop();
        console.log('Game started');
    }
    
    gameLoop() {
        if (!this.isRunning) return;
        
        this.updateBalls();
        this.render();
        
        requestAnimationFrame(() => this.gameLoop());
    }
    
    updateStatus(message) {
        this.statusElement.textContent = message;
        console.log(message);
    }
}

// Initialize the game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, creating simple game...');
    try {
        new SimpleBallBouncerGame();
    } catch (error) {
        console.error('Error creating game:', error);
    }
});

// Fallback for older browsers
window.addEventListener('load', () => {
    if (!document.querySelector('canvas')) {
        console.log('Fallback initialization...');
        try {
            new SimpleBallBouncerGame();
        } catch (error) {
            console.error('Fallback error:', error);
        }
    }
});
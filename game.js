console.log('=== IMMERSIVE AR BALL BOUNCER ===');

class ImmersiveBallBouncer {
    constructor() {
        console.log('Creating immersive AR ball bouncer...');
        
        this.canvas = null;
        this.gl = null;
        this.xrSession = null;
        this.xrRefSpace = null;
        this.xrViewerSpace = null;
        this.balls = [];
        this.planes = [];
        this.controllers = [];
        
        this.statusElement = document.getElementById('status');
        this.enterVRButton = document.getElementById('enterVR');
        
        if (!this.statusElement || !this.enterVRButton) {
            console.error('Required DOM elements not found!');
            return;
        }
        
        this.init();
    }
    
    async init() {
        console.log('Initializing immersive AR...');
        this.updateStatus('Prüfe WebXR AR Unterstützung...');
        
        // Always setup both modes initially
        this.setup2D();
        
        try {
            // Check WebXR support with detailed logging
            console.log('Checking navigator.xr:', !!navigator.xr);
            console.log('User agent:', navigator.userAgent);
            console.log('Current URL protocol:', window.location.protocol);
            
            if (!navigator.xr) {
                throw new Error('WebXR API nicht verfügbar');
            }
            
            console.log('WebXR API found, checking AR support...');
            
            // Check AR support with timeout
            const checkARSupport = async () => {
                try {
                    const isARSupported = await Promise.race([
                        navigator.xr.isSessionSupported('immersive-ar'),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('AR check timeout')), 5000)
                        )
                    ]);
                    console.log('AR support check result:', isARSupported);
                    return isARSupported;
                } catch (error) {
                    console.log('AR support check failed:', error);
                    return false;
                }
            };
            
            const isARSupported = await checkARSupport();
            
            if (isARSupported) {
                console.log('AR is supported! Setting up WebGL...');
                this.setupWebGL();
                this.setupShaders();
                this.setupARControls();
                this.updateStatus('AR bereit! Klicke "AR starten" (2D läuft parallel)');
            } else {
                console.log('AR not supported, but keeping AR button for testing');
                this.setupARControls(); // Keep AR button visible for testing
                this.updateStatus('AR nicht unterstützt - 2D Modus (AR Button zum Testen)');
            }
            
        } catch (error) {
            console.log('WebXR check failed:', error.message);
            this.setupARControls(); // Still show AR button for debugging
            this.updateStatus(`WebXR Fehler: ${error.message} - 2D Modus aktiv`);
        }
    }
    
    initFallback() {
        // Fallback to 2D canvas version
        this.updateStatus('2D Modus - Klicke zum Werfen');
        this.enterVRButton.textContent = 'Ball werfen!';
        this.enterVRButton.disabled = false;
        
        // Setup simple 2D version
        this.setup2D();
    }
    
    setup2D() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.zIndex = '1';
        this.canvas.style.background = 'radial-gradient(circle, #1a1a2e 0%, #000000 100%)';
        
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        
        this.enterVRButton.addEventListener('click', () => this.shoot2DBall());
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            this.shoot2DBallAt(x, y);
        });
        
        this.start2DLoop();
    }
    
    setupWebGL() {
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        document.body.appendChild(this.canvas);
        
        this.gl = this.canvas.getContext('webgl2', {
            xrCompatible: true,
            alpha: false,
            antialias: true
        });
        
        if (!this.gl) {
            throw new Error('WebGL2 nicht verfügbar');
        }
        
        console.log('WebGL2 context created');
    }
    
    setupShaders() {
        // Vertex shader for simple colored spheres
        const vertexShaderSource = `#version 300 es
            precision highp float;
            
            in vec3 position;
            in vec3 normal;
            
            uniform mat4 modelViewMatrix;
            uniform mat4 projectionMatrix;
            uniform mat3 normalMatrix;
            
            out vec3 vNormal;
            out vec3 vPosition;
            
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
        
        // Fragment shader with simple lighting
        const fragmentShaderSource = `#version 300 es
            precision highp float;
            
            in vec3 vNormal;
            in vec3 vPosition;
            
            uniform vec3 color;
            uniform vec3 lightDirection;
            
            out vec4 fragColor;
            
            void main() {
                vec3 normal = normalize(vNormal);
                float light = max(0.0, dot(normal, -lightDirection)) * 0.8 + 0.2;
                fragColor = vec4(color * light, 1.0);
            }
        `;
        
        this.shaderProgram = this.createShaderProgram(vertexShaderSource, fragmentShaderSource);
        this.gl.useProgram(this.shaderProgram);
        
        // Get uniform locations
        this.uniforms = {
            modelViewMatrix: this.gl.getUniformLocation(this.shaderProgram, 'modelViewMatrix'),
            projectionMatrix: this.gl.getUniformLocation(this.shaderProgram, 'projectionMatrix'),
            normalMatrix: this.gl.getUniformLocation(this.shaderProgram, 'normalMatrix'),
            color: this.gl.getUniformLocation(this.shaderProgram, 'color'),
            lightDirection: this.gl.getUniformLocation(this.shaderProgram, 'lightDirection')
        };
        
        // Set light direction
        this.gl.uniform3f(this.uniforms.lightDirection, 0.5, 1.0, 0.5);
        
        // Create sphere geometry
        this.createSphereGeometry();
        
        console.log('Shaders setup complete');
    }
    
    createShaderProgram(vertexSource, fragmentSource) {
        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentSource);
        
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error('Shader program link error:', this.gl.getProgramInfoLog(program));
            return null;
        }
        
        return program;
    }
    
    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        
        return shader;
    }
    
    createSphereGeometry() {
        const radius = 1;
        const widthSegments = 16;
        const heightSegments = 12;
        
        const positions = [];
        const normals = [];
        const indices = [];
        
        // Generate vertices
        for (let y = 0; y <= heightSegments; y++) {
            const v = y / heightSegments;
            const theta = v * Math.PI;
            
            for (let x = 0; x <= widthSegments; x++) {
                const u = x / widthSegments;
                const phi = u * Math.PI * 2;
                
                const px = -radius * Math.cos(phi) * Math.sin(theta);
                const py = radius * Math.cos(theta);
                const pz = radius * Math.sin(phi) * Math.sin(theta);
                
                positions.push(px, py, pz);
                normals.push(px / radius, py / radius, pz / radius);
            }
        }
        
        // Generate indices
        for (let y = 0; y < heightSegments; y++) {
            for (let x = 0; x < widthSegments; x++) {
                const a = y * (widthSegments + 1) + x;
                const b = a + widthSegments + 1;
                
                indices.push(a, b, a + 1);
                indices.push(b, b + 1, a + 1);
            }
        }
        
        // Create buffers
        this.sphereVAO = this.gl.createVertexArray();
        this.gl.bindVertexArray(this.sphereVAO);
        
        const positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);
        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 0, 0);
        
        const normalBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, normalBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(normals), this.gl.STATIC_DRAW);
        this.gl.enableVertexAttribArray(1);
        this.gl.vertexAttribPointer(1, 3, this.gl.FLOAT, false, 0, 0);
        
        const indexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl.STATIC_DRAW);
        
        this.sphereIndexCount = indices.length;
        
        console.log('Sphere geometry created');
    }
    
    setupARControls() {
        // Always show both buttons
        this.enterVRButton.textContent = 'AR starten';
        this.enterVRButton.disabled = false;
        this.enterVRButton.style.display = 'block';
        this.enterVRButton.style.backgroundColor = '#4CAF50';
        
        // Remove any existing event listeners
        this.enterVRButton.replaceWith(this.enterVRButton.cloneNode(true));
        this.enterVRButton = document.getElementById('enterVR');
        
        this.enterVRButton.addEventListener('click', () => {
            console.log('AR button clicked');
            this.startAR();
        });
        
        // Add a second button for 2D ball throwing
        if (!document.getElementById('shoot2D')) {
            const shoot2DButton = document.createElement('button');
            shoot2DButton.id = 'shoot2D';
            shoot2DButton.textContent = '2D Ball werfen';
            shoot2DButton.style.position = 'absolute';
            shoot2DButton.style.bottom = '80px';
            shoot2DButton.style.left = '50%';
            shoot2DButton.style.transform = 'translateX(-50%)';
            shoot2DButton.style.padding = '12px 24px';
            shoot2DButton.style.background = '#ff9500';
            shoot2DButton.style.color = 'white';
            shoot2DButton.style.border = 'none';
            shoot2DButton.style.borderRadius = '5px';
            shoot2DButton.style.fontSize = '16px';
            shoot2DButton.style.cursor = 'pointer';
            shoot2DButton.style.zIndex = '200';
            
            document.body.appendChild(shoot2DButton);
            
            shoot2DButton.addEventListener('click', () => {
                console.log('2D shoot button clicked');
                this.shoot2DBall();
            });
        }
        
        console.log('AR controls setup complete');
    }
    
    async startAR() {
        console.log('=== STARTING AR SESSION ===');
        
        try {
            this.updateStatus('Starte AR Session...');
            
            // Check if WebXR is available
            if (!navigator.xr) {
                throw new Error('WebXR nicht verfügbar auf diesem Gerät/Browser');
            }
            
            console.log('Requesting AR session with features...');
            
            // Try different feature combinations
            let sessionConfig = {
                optionalFeatures: ['local-floor', 'bounded-floor', 'plane-detection', 'anchors', 'hit-test']
            };
            
            let session = null;
            
            try {
                // Try full featured AR
                session = await navigator.xr.requestSession('immersive-ar', sessionConfig);
                console.log('Full-featured AR session created');
            } catch (fullError) {
                console.log('Full-featured AR failed:', fullError);
                
                try {
                    // Try basic AR
                    sessionConfig = { optionalFeatures: ['local'] };
                    session = await navigator.xr.requestSession('immersive-ar', sessionConfig);
                    console.log('Basic AR session created');
                } catch (basicError) {
                    console.log('Basic AR failed:', basicError);
                    
                    try {
                        // Try minimal AR
                        session = await navigator.xr.requestSession('immersive-ar');
                        console.log('Minimal AR session created');
                    } catch (minimalError) {
                        console.log('Minimal AR failed:', minimalError);
                        throw new Error(`AR Session konnte nicht gestartet werden: ${minimalError.message}`);
                    }
                }
            }
            
            this.xrSession = session;
            
            // Setup WebGL if not already done
            if (!this.gl) {
                console.log('Setting up WebGL for AR...');
                this.setupWebGL();
                this.setupShaders();
            }
            
            console.log('Making GL XR compatible...');
            await this.gl.makeXRCompatible();
            
            console.log('Creating XR layer...');
            const xrLayer = new XRWebGLLayer(this.xrSession, this.gl);
            await this.xrSession.updateRenderState({ baseLayer: xrLayer });
            
            console.log('Requesting reference spaces...');
            // Try different reference spaces
            try {
                this.xrRefSpace = await this.xrSession.requestReferenceSpace('local-floor');
                console.log('Using local-floor reference space');
            } catch (floorError) {
                console.log('local-floor failed, trying local:', floorError);
                try {
                    this.xrRefSpace = await this.xrSession.requestReferenceSpace('local');
                    console.log('Using local reference space');
                } catch (localError) {
                    console.log('local failed, trying viewer:', localError);
                    this.xrRefSpace = await this.xrSession.requestReferenceSpace('viewer');
                    console.log('Using viewer reference space');
                }
            }
            
            this.xrViewerSpace = await this.xrSession.requestReferenceSpace('viewer');
            
            // Setup controllers
            console.log('Setting up XR controllers...');
            this.setupXRControllers();
            
            // Start render loop
            console.log('Starting XR render loop...');
            this.xrSession.requestAnimationFrame((time, frame) => this.onXRFrame(time, frame));
            
            this.updateStatus('AR aktiv! Trigger zum Werfen, schaue dich um für Ebenenerkennung...');
            console.log('=== AR SESSION STARTED SUCCESSFULLY ===');
            
            // Handle session end
            this.xrSession.addEventListener('end', () => {
                console.log('AR session ended');
                this.xrSession = null;
                this.updateStatus('AR Session beendet - 2D Modus aktiv');
                this.enterVRButton.textContent = 'AR starten';
            });
            
        } catch (error) {
            const errorMsg = `AR Fehler: ${error.message}`;
            this.updateStatus(errorMsg);
            console.error('=== AR START FAILED ===');
            console.error('Error details:', error);
            console.error('Stack:', error.stack);
            
            // Show detailed error info
            alert(`AR konnte nicht gestartet werden:\n\n${error.message}\n\nFür AR benötigst du:\n- Ein AR-fähiges Gerät (Meta Quest, etc.)\n- Einen AR-kompatiblen Browser\n- HTTPS-Verbindung\n\nDer 2D-Modus funktioniert weiterhin.`);
        }
    }
    
    setupXRControllers() {
        // Setup input sources (controllers)
        this.xrSession.addEventListener('inputsourceschange', (event) => {
            console.log('Input sources changed');
            
            event.added.forEach(inputSource => {
                if (inputSource.targetRayMode === 'tracked-pointer') {
                    console.log('Controller added:', inputSource.handedness);
                    this.controllers.push(inputSource);
                }
            });
            
            event.removed.forEach(inputSource => {
                const index = this.controllers.indexOf(inputSource);
                if (index > -1) {
                    this.controllers.splice(index, 1);
                }
            });
        });
        
        // Handle select events
        this.xrSession.addEventListener('select', (event) => {
            console.log('Select event from controller');
            this.shootBallFromController(event.inputSource);
        });
    }
    
    shootBallFromController(inputSource) {
        if (!this.xrRefSpace) return;
        
        const targetRayPose = this.xrFrame.getPose(inputSource.targetRaySpace, this.xrRefSpace);
        if (!targetRayPose) return;
        
        const position = targetRayPose.transform.position;
        const orientation = targetRayPose.transform.orientation;
        
        // Calculate forward direction
        const forward = this.quatToForward(orientation);
        
        const ball = {
            position: [position.x, position.y, position.z],
            velocity: [forward.x * 5, forward.y * 5, forward.z * 5],
            radius: 0.05,
            color: this.getRandomColor(),
            gravity: -9.8,
            bounce: 0.7,
            created: Date.now()
        };
        
        this.balls.push(ball);
        console.log('Ball shot from controller');
        
        // Limit balls
        if (this.balls.length > 20) {
            this.balls.shift();
        }
    }
    
    quatToForward(quat) {
        // Convert quaternion to forward vector
        return {
            x: 2 * (quat.x * quat.z + quat.w * quat.y),
            y: 2 * (quat.y * quat.z - quat.w * quat.x),
            z: 2 * (quat.w * quat.w + quat.z * quat.z) - 1
        };
    }
    
    onXRFrame(time, frame) {
        if (!this.xrSession) return;
        
        this.xrFrame = frame;
        
        // Detect planes
        this.detectPlanes(frame);
        
        // Update physics
        this.updatePhysics(0.016); // ~60fps
        
        // Render frame
        this.renderXRFrame(frame);
        
        // Request next frame
        this.xrSession.requestAnimationFrame((time, frame) => this.onXRFrame(time, frame));
    }
    
    detectPlanes(frame) {
        if (frame.detectedPlanes) {
            frame.detectedPlanes.forEach((plane) => {
                // Check if this is a new plane
                const existingPlane = this.planes.find(p => p.plane === plane);
                if (!existingPlane) {
                    console.log('New plane detected');
                    this.planes.push({
                        plane: plane,
                        lastKnownPose: null
                    });
                }
            });
        }
    }
    
    updatePhysics(deltaTime) {
        for (let i = this.balls.length - 1; i >= 0; i--) {
            const ball = this.balls[i];
            
            // Apply gravity
            ball.velocity[1] += ball.gravity * deltaTime;
            
            // Update position
            ball.position[0] += ball.velocity[0] * deltaTime;
            ball.position[1] += ball.velocity[1] * deltaTime;
            ball.position[2] += ball.velocity[2] * deltaTime;
            
            // Check plane collisions
            this.checkPlaneCollisions(ball);
            
            // Remove old balls
            if (Date.now() - ball.created > 30000 || ball.position[1] < -5) {
                this.balls.splice(i, 1);
            }
        }
    }
    
    checkPlaneCollisions(ball) {
        this.planes.forEach(planeData => {
            if (!this.xrRefSpace || !this.xrFrame) return;
            
            const pose = this.xrFrame.getPose(planeData.plane.planeSpace, this.xrRefSpace);
            if (!pose) return;
            
            planeData.lastKnownPose = pose;
            
            // Simple plane collision (assuming horizontal planes for now)
            const planeY = pose.transform.position.y;
            
            if (ball.position[1] - ball.radius <= planeY && ball.velocity[1] < 0) {
                ball.position[1] = planeY + ball.radius;
                ball.velocity[1] *= -ball.bounce;
                
                // Add some friction
                ball.velocity[0] *= 0.9;
                ball.velocity[2] *= 0.9;
            }
        });
    }
    
    renderXRFrame(frame) {
        const session = frame.session;
        const pose = frame.getViewerPose(this.xrRefSpace);
        if (!pose) return;
        
        const layer = session.renderState.baseLayer;
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, layer.framebuffer);
        
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        this.gl.enable(this.gl.DEPTH_TEST);
        
        // Render for each eye
        for (const view of pose.views) {
            const viewport = layer.getViewport(view);
            this.gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
            
            this.renderScene(view);
        }
    }
    
    renderScene(view) {
        const projectionMatrix = view.projectionMatrix;
        const viewMatrix = view.transform.inverse.matrix;
        
        this.gl.uniformMatrix4fv(this.uniforms.projectionMatrix, false, projectionMatrix);
        
        // Render balls
        this.gl.bindVertexArray(this.sphereVAO);
        
        this.balls.forEach(ball => {
            const modelMatrix = this.createModelMatrix(ball.position, ball.radius);
            const modelViewMatrix = this.multiplyMatrices(viewMatrix, modelMatrix);
            const normalMatrix = this.getNormalMatrix(modelViewMatrix);
            
            this.gl.uniformMatrix4fv(this.uniforms.modelViewMatrix, false, modelViewMatrix);
            this.gl.uniformMatrix3fv(this.uniforms.normalMatrix, false, normalMatrix);
            this.gl.uniform3fv(this.uniforms.color, ball.color);
            
            this.gl.drawElements(this.gl.TRIANGLES, this.sphereIndexCount, this.gl.UNSIGNED_SHORT, 0);
        });
        
        // Render plane visualizations
        this.renderPlanes(viewMatrix);
    }
    
    renderPlanes(viewMatrix) {
        // Simple plane visualization (could be improved)
        this.planes.forEach(planeData => {
            if (!planeData.lastKnownPose) return;
            
            // For now, just render a simple indicator at the plane position
            const position = [
                planeData.lastKnownPose.transform.position.x,
                planeData.lastKnownPose.transform.position.y + 0.01,
                planeData.lastKnownPose.transform.position.z
            ];
            
            const modelMatrix = this.createModelMatrix(position, 0.1);
            const modelViewMatrix = this.multiplyMatrices(viewMatrix, modelMatrix);
            const normalMatrix = this.getNormalMatrix(modelViewMatrix);
            
            this.gl.uniformMatrix4fv(this.uniforms.modelViewMatrix, false, modelViewMatrix);
            this.gl.uniformMatrix3fv(this.uniforms.normalMatrix, false, normalMatrix);
            this.gl.uniform3fv(this.uniforms.color, [0.0, 0.8, 1.0]); // Blue plane indicator
            
            this.gl.drawElements(this.gl.TRIANGLES, this.sphereIndexCount, this.gl.UNSIGNED_SHORT, 0);
        });
    }
    
    createModelMatrix(position, scale) {
        return new Float32Array([
            scale, 0, 0, 0,
            0, scale, 0, 0,
            0, 0, scale, 0,
            position[0], position[1], position[2], 1
        ]);
    }
    
    multiplyMatrices(a, b) {
        const result = new Float32Array(16);
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                let sum = 0;
                for (let k = 0; k < 4; k++) {
                    sum += a[i * 4 + k] * b[k * 4 + j];
                }
                result[i * 4 + j] = sum;
            }
        }
        return result;
    }
    
    getNormalMatrix(modelViewMatrix) {
        // Extract 3x3 normal matrix from 4x4 modelview matrix
        const normalMatrix = new Float32Array(9);
        normalMatrix[0] = modelViewMatrix[0];
        normalMatrix[1] = modelViewMatrix[1];
        normalMatrix[2] = modelViewMatrix[2];
        normalMatrix[3] = modelViewMatrix[4];
        normalMatrix[4] = modelViewMatrix[5];
        normalMatrix[5] = modelViewMatrix[6];
        normalMatrix[6] = modelViewMatrix[8];
        normalMatrix[7] = modelViewMatrix[9];
        normalMatrix[8] = modelViewMatrix[10];
        return normalMatrix;
    }
    
    getRandomColor() {
        const colors = [
            [1.0, 0.4, 0.4], // Red
            [0.4, 1.0, 0.4], // Green
            [0.4, 0.4, 1.0], // Blue
            [1.0, 1.0, 0.4], // Yellow
            [1.0, 0.4, 1.0], // Magenta
            [0.4, 1.0, 1.0], // Cyan
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    // 2D Fallback methods
    shoot2DBall() {
        const x = Math.random() * (this.canvas.width - 100) + 50;
        this.shoot2DBallAt(x, 50);
    }
    
    shoot2DBallAt(x, y) {
        const ball = {
            x: x, y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: Math.random() * 5 + 2,
            radius: Math.random() * 15 + 10,
            color: this.getRandomColor2D(),
            bounce: 0.8, gravity: 0.5,
            created: Date.now()
        };
        this.balls.push(ball);
        if (this.balls.length > 30) this.balls.shift();
    }
    
    getRandomColor2D() {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3'];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    start2DLoop() {
        const animate = () => {
            this.update2D();
            this.render2D();
            requestAnimationFrame(animate);
        };
        animate();
    }
    
    update2D() {
        for (let i = this.balls.length - 1; i >= 0; i--) {
            const ball = this.balls[i];
            ball.vy += ball.gravity;
            ball.x += ball.vx;
            ball.y += ball.vy;
            
            if (ball.x - ball.radius <= 0 || ball.x + ball.radius >= this.canvas.width) {
                ball.vx *= -ball.bounce;
                ball.x = Math.max(ball.radius, Math.min(this.canvas.width - ball.radius, ball.x));
            }
            
            if (ball.y + ball.radius >= this.canvas.height) {
                ball.vy *= -ball.bounce;
                ball.y = this.canvas.height - ball.radius;
                if (Math.abs(ball.vy) < 1) ball.vy = 0;
            }
            
            if (Date.now() - ball.created > 20000) {
                this.balls.splice(i, 1);
            }
        }
    }
    
    render2D() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.balls.forEach(ball => {
            this.ctx.fillStyle = ball.color;
            this.ctx.beginPath();
            this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }
    
    updateStatus(message) {
        this.statusElement.textContent = message;
        console.log(message);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, creating immersive AR game...');
    try {
        new ImmersiveBallBouncer();
    } catch (error) {
        console.error('Error creating AR game:', error);
    }
});
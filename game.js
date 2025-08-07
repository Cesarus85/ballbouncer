console.log('=== GAME.JS LOADED ===');
console.log('THREE available:', typeof THREE);
console.log('CANNON available:', typeof CANNON);
console.log('WebXR available:', typeof navigator.xr);

class BallBouncerGame {
    constructor() {
        console.log('=== CREATING GAME INSTANCE ===');
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.world = null;
        this.xrSession = null;
        this.controllers = [];
        this.balls = [];
        this.planes = [];
        this.planeAnchors = [];
        
        this.statusElement = document.getElementById('status');
        this.enterVRButton = document.getElementById('enterVR');
        
        console.log('Status element found:', !!this.statusElement);
        console.log('VR button found:', !!this.enterVRButton);
        
        if (!this.statusElement || !this.enterVRButton) {
            console.error('Required DOM elements not found!');
            return;
        }
        
        console.log('Starting initialization...');
        this.init();
    }
    
    async init() {
        try {
            this.updateStatus('Prüfe WebXR Unterstützung...');
            console.log('Starting initialization...');
            
            if (!navigator.xr) {
                console.log('WebXR not available, falling back to desktop mode');
                this.initDesktopMode();
                return;
            }
            
            console.log('WebXR available, checking AR support...');
            const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
            console.log('AR supported:', isSupported);
            
            if (!isSupported) {
                console.log('AR not supported, trying VR...');
                const isVRSupported = await navigator.xr.isSessionSupported('immersive-vr');
                console.log('VR supported:', isVRSupported);
                
                if (!isVRSupported) {
                    console.log('Neither AR nor VR supported, falling back to desktop');
                    this.initDesktopMode();
                    return;
                }
                this.xrMode = 'immersive-vr';
            } else {
                this.xrMode = 'immersive-ar';
            }
            
            console.log('Setting up scene...');
            this.setupScene();
            console.log('Setting up physics...');
            this.setupPhysics();
            console.log('Setting up renderer...');
            this.setupRenderer();
            console.log('Setting up controllers...');
            this.setupControllers();
            
            this.enterVRButton.disabled = false;
            this.enterVRButton.addEventListener('click', () => this.enterXR());
            
            this.updateStatus(`Bereit! Klicke "VR starten" (${this.xrMode})`);
            console.log('Initialization complete');
            
        } catch (error) {
            this.updateStatus('Fehler: ' + error.message);
            console.error('Initialisierungsfehler:', error);
            this.initDesktopMode();
        }
    }
    
    initDesktopMode() {
        console.log('Initializing desktop mode...');
        this.xrMode = 'desktop';
        
        this.setupScene();
        this.setupPhysics();
        this.setupRenderer();
        
        // Add basic camera controls for desktop
        this.camera.position.set(0, 1.6, 3);
        
        // Add a ground plane for desktop mode
        this.addDesktopGround();
        
        // Change button text and functionality
        this.enterVRButton.textContent = 'Bälle werfen';
        this.enterVRButton.disabled = false;
        this.enterVRButton.addEventListener('click', () => this.shootBallDesktop());
        
        this.updateStatus('Desktop-Modus bereit! Klicke zum Werfen');
        
        // Start animation loop
        this.animate();
    }
    
    addDesktopGround() {
        // Visual ground
        const groundGeometry = new THREE.PlaneGeometry(10, 10);
        const groundMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x808080,
            transparent: true,
            opacity: 0.5 
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -1;
        this.scene.add(ground);
        
        // Physics ground
        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0 });
        groundBody.addShape(groundShape);
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        groundBody.position.set(0, -1, 0);
        this.world.addBody(groundBody);
    }
    
    shootBallDesktop() {
        const ballGeometry = new THREE.SphereGeometry(0.05, 16, 16);
        const ballMaterial = new THREE.MeshLambertMaterial({
            color: Math.random() * 0xffffff
        });
        const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
        ballMesh.castShadow = true;
        
        // Random starting position and direction for desktop
        const startX = (Math.random() - 0.5) * 2;
        const startY = 2;
        const startZ = 2;
        
        ballMesh.position.set(startX, startY, startZ);
        this.scene.add(ballMesh);
        
        // Physics body
        const ballShape = new CANNON.Sphere(0.05);
        const ballBody = new CANNON.Body({ 
            mass: 1,
            material: new CANNON.Material({ friction: 0.3, restitution: 0.8 })
        });
        ballBody.addShape(ballShape);
        ballBody.position.set(startX, startY, startZ);
        
        // Random velocity
        const velocity = new CANNON.Vec3(
            (Math.random() - 0.5) * 5,
            -2,
            (Math.random() - 0.5) * 5
        );
        ballBody.velocity = velocity;
        
        this.world.addBody(ballBody);
        
        this.balls.push({
            mesh: ballMesh,
            body: ballBody,
            created: Date.now()
        });
        
        // Remove old balls
        if (this.balls.length > 20) {
            const oldBall = this.balls.shift();
            this.scene.remove(oldBall.mesh);
            this.world.removeBody(oldBall.body);
            oldBall.mesh.geometry.dispose();
            oldBall.mesh.material.dispose();
        }
    }
    
    setupScene() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        
        // Ambient light for better visibility
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        // Directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1);
        this.scene.add(directionalLight);
    }
    
    setupPhysics() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);
        this.world.broadphase = new CANNON.NaiveBroadphase();
        
        // Default contact material
        const contactMaterial = new CANNON.ContactMaterial(
            new CANNON.Material(),
            new CANNON.Material(),
            {
                friction: 0.3,
                restitution: 0.7
            }
        );
        this.world.addContactMaterial(contactMaterial);
    }
    
    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        document.body.appendChild(this.renderer.domElement);
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }
    
    setupControllers() {
        for (let i = 0; i < 2; i++) {
            const controller = this.renderer.xr.getController(i);
            controller.addEventListener('selectstart', (event) => this.onSelectStart(event, i));
            controller.addEventListener('selectend', (event) => this.onSelectEnd(event, i));
            
            // Visual representation of controller
            const geometry = new THREE.CylinderGeometry(0.005, 0.05, 0.1, 6);
            const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const mesh = new THREE.Mesh(geometry, material);
            controller.add(mesh);
            
            this.scene.add(controller);
            this.controllers[i] = controller;
        }
    }
    
    async enterXR() {
        try {
            this.updateStatus(`Starte ${this.xrMode}-Session...`);
            console.log('Requesting XR session:', this.xrMode);
            
            let sessionOptions = {};
            
            if (this.xrMode === 'immersive-ar') {
                sessionOptions = {
                    optionalFeatures: ['plane-detection', 'anchors', 'local-floor']
                };
            } else if (this.xrMode === 'immersive-vr') {
                sessionOptions = {
                    optionalFeatures: ['local-floor', 'bounded-floor']
                };
            }
            
            const session = await navigator.xr.requestSession(this.xrMode, sessionOptions);
            console.log('XR session created successfully');
            
            this.xrSession = session;
            
            session.addEventListener('end', () => {
                console.log('XR session ended');
                this.xrSession = null;
                this.updateStatus('XR-Session beendet');
            });
            
            await this.renderer.xr.setSession(session);
            console.log('Renderer XR session set');
            
            if (this.xrMode === 'immersive-ar') {
                this.updateStatus('AR aktiv - Erkenne Ebenen...');
                this.startPlaneDetection();
            } else {
                this.updateStatus('VR aktiv! Trigger drücken zum Werfen');
            }
            
            this.animate();
            
        } catch (error) {
            this.updateStatus(`${this.xrMode}-Fehler: ${error.message}`);
            console.error('XR-Fehler:', error);
        }
    }
    
    startPlaneDetection() {
        if (!this.xrSession) return;
        
        this.xrSession.addEventListener('frameupdate', () => {
            const frame = this.renderer.xr.getFrame();
            if (!frame) return;
            
            const referenceSpace = this.renderer.xr.getReferenceSpace();
            const detectedPlanes = frame.detectedPlanes;
            
            if (detectedPlanes) {
                detectedPlanes.forEach((plane, planeId) => {
                    if (!this.planeAnchors.has(planeId)) {
                        this.addPlane(plane, referenceSpace);
                        this.planeAnchors.set(planeId, plane);
                    }
                });
            }
        });
    }
    
    addPlane(plane, referenceSpace) {
        try {
            const pose = plane.planeSpace.getPose(referenceSpace);
            if (!pose) return;
            
            const polygon = plane.polygon;
            if (!polygon || polygon.length < 3) return;
            
            // Create visual representation
            const shape = new THREE.Shape();
            shape.moveTo(polygon[0].x, polygon[0].z);
            
            for (let i = 1; i < polygon.length; i++) {
                shape.lineTo(polygon[i].x, polygon[i].z);
            }
            
            const geometry = new THREE.ShapeGeometry(shape);
            const material = new THREE.MeshBasicMaterial({
                color: 0x0088ff,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide
            });
            
            const planeMesh = new THREE.Mesh(geometry, material);
            
            // Set position and orientation
            planeMesh.position.set(
                pose.transform.position.x,
                pose.transform.position.y,
                pose.transform.position.z
            );
            
            planeMesh.quaternion.set(
                pose.transform.orientation.x,
                pose.transform.orientation.y,
                pose.transform.orientation.z,
                pose.transform.orientation.w
            );
            
            this.scene.add(planeMesh);
            
            // Create physics body
            const planeShape = new CANNON.Plane();
            const planeBody = new CANNON.Body({ mass: 0 });
            planeBody.addShape(planeShape);
            
            planeBody.position.set(
                pose.transform.position.x,
                pose.transform.position.y,
                pose.transform.position.z
            );
            
            planeBody.quaternion.set(
                pose.transform.orientation.x,
                pose.transform.orientation.y,
                pose.transform.orientation.z,
                pose.transform.orientation.w
            );
            
            this.world.addBody(planeBody);
            
            this.planes.push({
                mesh: planeMesh,
                body: planeBody,
                plane: plane
            });
            
            this.updateStatus(`${this.planes.length} Ebene(n) erkannt`);
            
        } catch (error) {
            console.error('Fehler beim Hinzufügen der Ebene:', error);
        }
    }
    
    onSelectStart(event, controllerIndex) {
        this.shootBall(controllerIndex);
    }
    
    onSelectEnd(event, controllerIndex) {
        // Optional: Handle select end
    }
    
    shootBall(controllerIndex) {
        const controller = this.controllers[controllerIndex];
        if (!controller) return;
        
        const ballGeometry = new THREE.SphereGeometry(0.05, 16, 16);
        const ballMaterial = new THREE.MeshLambertMaterial({
            color: Math.random() * 0xffffff
        });
        const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
        ballMesh.castShadow = true;
        
        // Get controller position and direction
        const controllerMatrix = controller.matrixWorld;
        const position = new THREE.Vector3();
        const direction = new THREE.Vector3();
        
        position.setFromMatrixPosition(controllerMatrix);
        direction.set(0, 0, -1).applyMatrix4(controllerMatrix).normalize();
        
        ballMesh.position.copy(position);
        this.scene.add(ballMesh);
        
        // Create physics body with optimized properties for Quest 3
        const ballShape = new CANNON.Sphere(0.05);
        const ballBody = new CANNON.Body({ 
            mass: 1,
            material: new CANNON.Material({ friction: 0.3, restitution: 0.8 })
        });
        ballBody.addShape(ballShape);
        
        ballBody.position.set(position.x, position.y, position.z);
        
        // Apply initial velocity
        const velocity = new CANNON.Vec3(
            direction.x * 10,
            direction.y * 10,
            direction.z * 10
        );
        ballBody.velocity = velocity;
        
        this.world.addBody(ballBody);
        
        this.balls.push({
            mesh: ballMesh,
            body: ballBody,
            created: Date.now()
        });
        
        // Remove old balls (keep only last 20)
        if (this.balls.length > 20) {
            const oldBall = this.balls.shift();
            this.scene.remove(oldBall.mesh);
            this.world.removeBody(oldBall.body);
            oldBall.mesh.geometry.dispose();
            oldBall.mesh.material.dispose();
        }
    }
    
    animate() {
        if (this.xrMode === 'desktop') {
            // Desktop animation loop
            const animate = () => {
                requestAnimationFrame(animate);
                this.render();
            };
            animate();
        } else {
            // XR animation loop
            this.renderer.setAnimationLoop(() => this.render());
        }
    }
    
    render() {
        if (!this.world) return;
        
        // Update physics with variable timestep for better performance
        const deltaTime = Math.min(1/60, 1/30);
        this.world.step(deltaTime);
        
        // Sync ball meshes with physics bodies
        this.balls.forEach(ball => {
            ball.mesh.position.copy(ball.body.position);
            ball.mesh.quaternion.copy(ball.body.quaternion);
        });
        
        // Remove balls that fell too far or are too old
        this.balls = this.balls.filter(ball => {
            const shouldRemove = ball.body.position.y < -10 || 
                               Date.now() - ball.created > 30000;
            
            if (shouldRemove) {
                this.scene.remove(ball.mesh);
                this.world.removeBody(ball.body);
                ball.mesh.geometry.dispose();
                ball.mesh.material.dispose();
                return false;
            }
            return true;
        });
        
        this.renderer.render(this.scene, this.camera);
    }
    
    updateStatus(message) {
        this.statusElement.textContent = message;
        console.log(message);
    }
}

// Initialize the game when the page loads
console.log('=== SETTING UP GAME INITIALIZATION ===');

function initializeGame() {
    console.log('DOM loaded, initializing game...');
    console.log('Document ready state:', document.readyState);
    
    // Check if required elements exist
    const statusElement = document.getElementById('status');
    const enterVRButton = document.getElementById('enterVR');
    
    console.log('Status element exists:', !!statusElement);
    console.log('VR button exists:', !!enterVRButton);
    
    if (statusElement && enterVRButton) {
        console.log('Creating game instance...');
        try {
            new BallBouncerGame();
        } catch (error) {
            console.error('Error creating game:', error);
        }
    } else {
        console.error('Required DOM elements not found, retrying in 500ms...');
        setTimeout(initializeGame, 500);
    }
}

// Try multiple initialization methods
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGame);
} else {
    // DOM already loaded
    setTimeout(initializeGame, 100);
}

// Fallback
window.addEventListener('load', () => {
    console.log('Window loaded, checking if game was initialized...');
    setTimeout(() => {
        if (!document.getElementById('status').textContent.includes('Desktop') && 
            !document.getElementById('status').textContent.includes('Bereit')) {
            console.log('Game seems not initialized, trying again...');
            initializeGame();
        }
    }, 1000);
});
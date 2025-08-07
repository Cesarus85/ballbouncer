class BallBouncerGame {
    constructor() {
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
        
        this.init();
    }
    
    async init() {
        try {
            this.updateStatus('Prüfe WebXR Unterstützung...');
            
            if (!navigator.xr) {
                throw new Error('WebXR wird nicht unterstützt');
            }
            
            const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
            if (!isSupported) {
                throw new Error('AR-Modus wird nicht unterstützt');
            }
            
            this.setupScene();
            this.setupPhysics();
            this.setupRenderer();
            this.setupControllers();
            
            this.enterVRButton.disabled = false;
            this.enterVRButton.addEventListener('click', () => this.enterXR());
            
            this.updateStatus('Bereit! Klicke "VR starten"');
            
        } catch (error) {
            this.updateStatus('Fehler: ' + error.message);
            console.error('Initialisierungsfehler:', error);
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
            this.updateStatus('Starte AR-Session...');
            
            const session = await navigator.xr.requestSession('immersive-ar', {
                requiredFeatures: ['plane-detection'],
                optionalFeatures: ['anchors']
            });
            
            this.xrSession = session;
            
            session.addEventListener('end', () => {
                this.xrSession = null;
                this.updateStatus('AR-Session beendet');
            });
            
            await this.renderer.xr.setSession(session);
            
            this.updateStatus('AR aktiv - Erkenne Ebenen...');
            this.startPlaneDetection();
            this.animate();
            
        } catch (error) {
            this.updateStatus('AR-Fehler: ' + error.message);
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
        if (this.xrSession) {
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
window.addEventListener('load', () => {
    new BallBouncerGame();
});
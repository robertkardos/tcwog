var Game = function () {
	this.utils = {
		timestamp : function () {
			return window.performance && window.performance.now ? window.performance.now() : new Date().getTime();
		},
		springs   : {
			stiffness : 700,
			damping   : 30,
			maxLength : 7
		},
	};
	this.objects = {
		cubes     : [],
		lines     : [],
		springs   : [],
		obstacles : []
	};
	this.nearestCubes;

	var that        = this,
		dt          = 0,
		step        = 1/60,
		last        = this.utils.timestamp(),
		fpsmeter    = new FPSMeter(document.getElementById('fpsmeter'), { decimals: 0, graph: true, theme: 'dark', left: '5px' }),
		pressedKeys = [],
		mouse       = new THREE.Vector2();


	var createBridge = function (index1, index2, restLength) {
		that.objects.springs.push(
			new CANNON.Spring(that.objects.cubes[index1].body, that.objects.cubes[index2].body, {
				localAnchorA : new CANNON.Vec3(0, 0, 0),
				localAnchorB : new CANNON.Vec3(0, 0, 0),
				restLength   : restLength || 5,
				stiffness    : that.utils.springs.stiffness,
				damping      : that.utils.springs.damping
			})
		);

		var material,
			geometry,
			line;

		material = new THREE.LineBasicMaterial({
			color : 0x66ffff
		});
		geometry = new THREE.Geometry();
		geometry.vertices.push(that.objects.cubes[index1].mesh.position);
		geometry.vertices.push(that.objects.cubes[index2].mesh.position);
		line = new THREE.Line(geometry, material);

		that.objects.lines.push({
			material  : material,
			geometry  : geometry,
			mesh      : line,
			box1      : index1,
			box2      : index2
		});
		scene.add(line);
	};


	var scene,
		camera,
		renderer,
		spotlight;

	var raycaster,
		mouseIndicator,
		mouseIndicatorEnabled,
		distances;

	var gameBoxGeometry,
		gameBoxMaterial,
		gameBox;

	var gameFieldGeometry,
		gameFieldMaterial,
		gameField;

	var gameFieldRearGeometry,
		gameFieldRearMaterial,
		gameFieldRear;

	var obstacleGeometry,
		obstacleMaterial,
		obstacle;

	var world,
		solver,
		split;

	var springs;

	var groundMaterial,
		groundShape,
		groundBody;

	var planeMaterial,
		planeShape,
		planeRear,
		planeFront;

	var boxShape,
		boxCannonMaterial;

	this.initGameField = function () {
		scene = new THREE.Scene();
		scene.fog = new THREE.Fog(0x000000, 0, 500);

		camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
		camera.translateX(0);
		camera.translateY(20);
		camera.translateZ(30);

		renderer = new THREE.WebGLRenderer();
		renderer.shadowMapType = THREE.PCFSoftShadowMap;
		renderer.shadowMapEnabled = true;
		renderer.shadowMapSoft = true;
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setClearColor(scene.fog.color, 1);


		/*gameBoxGeometry = new THREE.BoxGeometry(50, 50, 50);
		gameBoxMaterial = new THREE.MeshLambertMaterial({ color : 0x669999 , side : THREE.BackSide });
		gameBox         = new THREE.Mesh(gameBoxGeometry, gameBoxMaterial);
		gameBox.receiveShadow = true;
		scene.add(gameBox);
*/

		gameFieldGeometry = new THREE.PlaneBufferGeometry(70, 6, 50, 50);
		gameFieldGeometry.applyMatrix(new THREE.Matrix4().makeRotationX(- Math.PI / 2));
		gameFieldMaterial = new THREE.MeshLambertMaterial({ color : 0xaaaaaa });
		gameField         = new THREE.Mesh(gameFieldGeometry, gameFieldMaterial);

		gameField.position.z    = 3;
		gameField.castShadow    = true;
		gameField.receiveShadow = true;
		scene.add(gameField);


		gameFieldRearGeometry = new THREE.PlaneBufferGeometry(70, 40, 50, 50);
		gameFieldRearMaterial = new THREE.MeshLambertMaterial({ color : 0xccccff });
		gameFieldRear         = new THREE.Mesh(gameFieldRearGeometry, gameFieldRearMaterial);

		gameFieldRear.position.y    = 20;
		gameFieldRear.position.z    = -0.1;
		gameFieldRear.castShadow    = true;
		gameFieldRear.receiveShadow = true;
		scene.add(gameFieldRear);

		obstacleGeometry = new THREE.CylinderGeometry(3, 3, 0.8, 32);
		obstacleMaterial = new THREE.MeshLambertMaterial({ color : 0xff2255 , transparent : true , opacity : 0.5 });
		obstacle         = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
		obstacle.applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));

		obstacle.position.y = 14;
		scene.add(obstacle);

		var ambientLight;
		ambientLight = new THREE.AmbientLight(0x222222);
		scene.add(ambientLight);


		spotlight = new THREE.SpotLight(0xffffff);
		spotlight.position.set(-15, 60, 14);
		spotlight.shadowMapWidth      = 1024;
		spotlight.shadowMapHeight     = 1024;
		spotlight.shadowCameraNear    = 10;
		spotlight.shadowCameraFov     = 50;
		spotlight.shadowDarkness      = 0.95;
		spotlight.intensity           = 1.6;
		spotlight.castShadow          = true;
		scene.add(spotlight);


		solver = new CANNON.GSSolver();
		world  = new CANNON.World();
		world.gravity.set(0, -20, 0);
		world.quatNormalizeSkip = 0;
		world.quatNormalizeFast = false;

		world.defaultContactMaterial.contactEquationStiffness = 1e9;
		world.defaultContactMaterial.contactEquationRelaxation = 4;

		solver.iterations = 7;
		solver.tolerance = 0.1;
		split = true;
		if (split) {
			world.solver = new CANNON.SplitSolver(solver);
		}
		else {
			world.solver = solver;
		}

		world.broadphase = new CANNON.NaiveBroadphase();

		groundMaterial = new CANNON.Material();

		groundShape    = new CANNON.Plane();
		groundBody     = new CANNON.Body({ mass : 0 , material : groundMaterial });
		groundBody.addShape(groundShape);
		groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), - Math.PI / 2);
		world.add(groundBody);


		planeMaterial = new CANNON.Material();
		planeShape    = new CANNON.Plane();

		planeRear     = new CANNON.Body({ mass: 0 , material : planeMaterial });
		planeRear.addShape(planeShape);
		planeRear.position.set(0, 0, -0.5);
		world.add(planeRear);

		planeFront    = new CANNON.Body({ mass: 0 , material : planeMaterial });
		planeFront.addShape(planeShape);
		planeFront.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), - Math.PI);
		planeFront.position.set(0, 0, 0.55);
		world.add(planeFront);

		raycaster = new THREE.Raycaster();
	};


	this.initObjects = function () {
		var mouseIndicatorMaterial = new THREE.MeshLambertMaterial({ color : 0xffdddd }),
			mouseIndicatorGeometry = new THREE.BoxGeometry(1, 1, 1);
		mouseIndicator             = new THREE.Mesh(mouseIndicatorGeometry, mouseIndicatorMaterial);
		mouseIndicatorEnabled = false;

		distances = [];

		this.nearestCubes = [];
		for (var i = 0; i <= 2; i++) {
			var material,
				geometry,
				line;

			material = new THREE.LineBasicMaterial({ color : 0x66ffff });
			geometry = new THREE.Geometry();
			geometry.vertices.push(new THREE.Vector3(10, 0, 0));
			geometry.vertices.push(new THREE.Vector3(-10, 0, 10));
			line     = new THREE.Line(geometry, material);

			this.nearestCubes.push({
				distance : undefined,
				index    : undefined,
				line     : line
			});

			scene.add(this.nearestCubes[i].line);
		}

		mouseIndicator.visible = false;
		scene.add(mouseIndicator);


		var halfExtents = new CANNON.Vec3(0.5, 0.5, 0.5);

		boxShape          = new CANNON.Box(halfExtents);
		boxCannonMaterial = new CANNON.Material();
		
		var boxCannonMaterial_ground = new CANNON.ContactMaterial(groundMaterial, boxCannonMaterial, { friction: 1, restitution: 0 });
		world.addContactMaterial(boxCannonMaterial_ground);
		
		var boxCannonMaterial_boxCannonMaterial = new CANNON.ContactMaterial(boxCannonMaterial, boxCannonMaterial, { friction: 0.9, restitution: 0.5 });
		world.addContactMaterial(boxCannonMaterial_boxCannonMaterial);
		
		var boxCannonMaterial_planeMaterial = new CANNON.ContactMaterial(boxCannonMaterial, planeMaterial, { friction: 0, restitution: 0 });
		world.addContactMaterial(boxCannonMaterial_planeMaterial);

		var boxGeometry = new THREE.BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2);

		for (var i = 0; i < 3; i++) {
			var x = 0;
			var y = i * 3;
			var z = 0;

			var boxMaterial = new THREE.MeshLambertMaterial({ color : 0x99ffff });
			var boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
			var boxBody = new CANNON.Body({ mass : 3, material : boxCannonMaterial });
			boxBody.addShape(boxShape);
			world.add(boxBody);
			scene.add(boxMesh);
			boxBody.position.set(x, y, z);
			boxMesh.position.set(x, y, z);
			boxMesh.castShadow    = true;
			boxMesh.receiveShadow = true;
			this.objects.cubes.push({
				body : boxBody,
				mesh : boxMesh
			});
		}

		createBridge(0, 1);
		createBridge(1, 2);
		createBridge(2, 0);
	};

	this.handleKeyUp = function (event) {
		pressedKeys[event.keyCode] = false;
	};
	this.handleKeyDown = function (event) {
		pressedKeys[event.keyCode] = true;
	};
	this.handleKeys = function () {
		/*if (pressedKeys[32]) {
			debugger;
		}*/
		if (pressedKeys[33]) {
			// Page Up
			z -= 0.05;
		}
		if (pressedKeys[34]) {
			// Page Down
			z += 0.05;
		}
		if (pressedKeys[37]) {
			// Left cursor key
			this.objects.cubes[0].position.x += -0.4;
		}
		if (pressedKeys[39]) {
			// Right cursor key
			this.objects.cubes[0].position.x -= -0.4;
		}
		if (pressedKeys[38]) {
			// Up cursor key
			this.objects.cubes[0].position.z += -0.4;
		}
		if (pressedKeys[40]) {
			// Down cursor key
			this.objects.cubes[0].position.z -= -0.4;
		}
	};
	this.handleMouseMove = function (event) {
		event.preventDefault();
		mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
		mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
	};
	this.handleMouseClick = function (event) {
		if (mouseIndicatorEnabled && that.nearestCubes[0].distance <= that.utils.springs.maxLength && that.nearestCubes[1].distance <= that.utils.springs.maxLength) {
			var boxMaterial    = new THREE.MeshLambertMaterial({ color : 0xdddddd }),
				newBoxGeometry = new THREE.BoxGeometry(1, 1, 1),
				newBoxMesh     = new THREE.Mesh(newBoxGeometry, boxMaterial),
				newBoxBody     = new CANNON.Body({ mass : 3, material : boxCannonMaterial });

			newBoxBody.addShape(boxShape);
			world.add(newBoxBody);
			scene.add(newBoxMesh);
			newBoxBody.position.set(mouseIndicator.position.x, mouseIndicator.position.y, mouseIndicator.position.z);
			newBoxMesh.position.set(mouseIndicator.position.x, mouseIndicator.position.y, mouseIndicator.position.z);
			newBoxMesh.castShadow    = true;
			newBoxMesh.receiveShadow = true;
			that.objects.cubes.push({
				body : newBoxBody,
				mesh : newBoxMesh
			});

			for (var i = 0; i < that.nearestCubes.length; i++) {
				if (that.nearestCubes[i].distance) {
					createBridge(that.nearestCubes[i].index, that.objects.cubes.length - 1, that.nearestCubes[i].distance);
					that.nearestCubes[i].line.remove();
				}
			}
		}
	};


	this.update = function (step) {
		world.step(step);

		_.each(this.objects.springs, function (spring) {
			spring.applyForce();
		});

		this.handleKeys();

		var objectsToCheck = [];

		for (var i = 0; i < this.objects.cubes[i]; i++) {
			objectsToCheck.push(this.objects.cubes[i].mesh);
		}

		objectsToCheck.push(gameFieldRear);
		objectsToCheck.push(obstacle);

		raycaster.setFromCamera(mouse, camera);
		var intersection = raycaster.intersectObjects(objectsToCheck);

		if (intersection.length != 0 && intersection.length < 2) {
			mouseIndicatorEnabled = true;
			mouseIndicator.position.set(intersection[0].point.x, intersection[0].point.y, intersection[0].point.z);
		} else {
			mouseIndicatorEnabled = false;
		}

		if (mouseIndicatorEnabled) {
			mouseIndicator.visible = true;
		} else {
			mouseIndicator.visible = false;
		}

/*  REFRESH LINES ACCORDING TO THEIR ENDPOINT BOXES  */
		for (var i = 0; i < this.objects.lines.length; i++) {
			this.objects.lines[i].mesh.geometry.vertices[0].set(this.objects.cubes[this.objects.lines[i].box1].mesh.position);
			this.objects.lines[i].mesh.geometry.vertices[1].set(this.objects.cubes[this.objects.lines[i].box2].mesh.position);
			this.objects.lines[i].mesh.geometry.verticesNeedUpdate = true;
		}
/* / REFRESH LINES ACCORDING TO THEIR ENDPOINT BOXES */

		for (var i = 0; i < this.objects.cubes.length; i++) {
/*  UPDATE CUBE POSITIONS  */
			this.objects.cubes[i].mesh.position.copy(this.objects.cubes[i].body.position);
			this.objects.cubes[i].mesh.quaternion.copy(this.objects.cubes[i].body.quaternion);
/* / UPDATE CUBE POSITIONS */

/*  LOOKING FOR THE 2 NEAREST BOXES  */
			var dx = this.objects.cubes[i].mesh.position.x - mouseIndicator.position.x,
				dy = this.objects.cubes[i].mesh.position.y - mouseIndicator.position.y,
				dz = this.objects.cubes[i].mesh.position.z - mouseIndicator.position.z;

			distances.push(Math.sqrt(dx * dx + dy * dy + dz * dz));
			this.objects.cubes[i].mesh.material.transparent = false;
		}

		var distancesMin,
			distancesMinIndex;

		for (var i = 0; i <= 2; i++) {
			distancesMin      = _.min(distances);
			distancesMinIndex = _.indexOf(distances, distancesMin);

			if (mouseIndicatorEnabled && distancesMin <= this.utils.springs.maxLength) {
				var material,
					geometry,
					line;

				material = new THREE.LineBasicMaterial({
					color : 0x66ffff
				});
				geometry = new THREE.Geometry();
				geometry.vertices.push(this.objects.cubes[distancesMinIndex].mesh.position);
				geometry.vertices.push(mouseIndicator.position);
				line = new THREE.Line(geometry, material);

				this.nearestCubes[i].line.visible = true;
				this.nearestCubes[i].line.geometry.vertices[0].set(this.objects.cubes[distancesMinIndex].mesh.position.x, this.objects.cubes[distancesMinIndex].mesh.position.y, this.objects.cubes[distancesMinIndex].mesh.position.z);
				this.nearestCubes[i].line.geometry.vertices[1].set(mouseIndicator.position.x, mouseIndicator.position.y, mouseIndicator.position.z);
				this.nearestCubes[i].line.geometry.verticesNeedUpdate = true;

				this.nearestCubes[i].distance = distancesMin;
				this.nearestCubes[i].index    = distancesMinIndex;
			} else {
				this.nearestCubes[i].line.visible = false;
				this.nearestCubes[i].distance = undefined;
				this.nearestCubes[i].index    = undefined;
			}

			distances[distancesMinIndex] = Infinity;
		}

		distances = [];
/* / LOOKING FOR THE 2 NEAREST BOXES */
	};

	this.render = function () {
		renderer.render(scene, camera);
	};

	this.frame = function () {
		fpsmeter.tickStart();
		now  = that.utils.timestamp();
		dt   = dt + Math.min(1, (now - last) / 1000);
		while (dt > step) {
			dt = dt - step;
			that.update(step);
			fpsmeter.tick();
		}
		that.render(dt);
		last = now;
		requestAnimationFrame(that.frame);
	};

	this.init = function () {
		this.initGameField();
		this.initObjects();

		raycaster = new THREE.Raycaster();

		renderer.setSize(window.innerWidth, window.innerHeight);

		document.body.appendChild(renderer.domElement);
		document.onkeyup     = this.handleKeyUp;
		document.onkeydown   = this.handleKeyDown;
		document.onmousemove = this.handleMouseMove;
		document.onclick     = this.handleMouseClick;

		for (var i = this.objects.cubes.length - 1; i >= 0; i--) {
			scene.add(this.objects.cubes[i].mesh);
		}
		
		this.frame();
	};
};

var game = new Game();
game.init();
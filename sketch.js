let pos, vel, targetVel;
let accel = 0.2;
let maxSpeed = 8;

function setup() {
  createCanvas(1000, 400);
  pos = createVector(width / 2, height / 2);
  vel = createVector(0, 0);
  targetVel = createVector(0, 0);
}

function draw() {
  background(0);
  fill(255);
  ellipse(pos.x, pos.y, 100, 100);

  // Movement input: WASD + arrow keys
  targetVel.set(0, 0);
  if (keyIsDown(LEFT_ARROW) || keyIsDown(65)) {
    targetVel.x = -maxSpeed;
  }
  if (keyIsDown(RIGHT_ARROW) || keyIsDown(68)) {
    targetVel.x = maxSpeed;
  }
  if (keyIsDown(UP_ARROW) || keyIsDown(87)) {
    targetVel.y = -maxSpeed;
  }
  if (keyIsDown(DOWN_ARROW) || keyIsDown(83)) {
    targetVel.y = maxSpeed;
  }

  // Smooth velocity change
  vel.lerp(targetVel, accel);

  // Move circle
  pos.add(vel);

  // Bounce off walls
  if (pos.x <= 50 || pos.x >= width - 50) {
    vel.x *= -1;
    pos.x = constrain(pos.x, 50, width - 50);
  }
  if (pos.y <= 50 || pos.y >= height - 50) {
    vel.y *= -1;
    pos.y = constrain(pos.y, 50, height - 50);
  }
}

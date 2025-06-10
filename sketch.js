let x = 0;
let y = 0;
let speed = 5;

function setup() {
  createCanvas(1000, 400);
}

function draw() {
  background(0);
  fill(255);
  ellipse(x + width / 2, height / 2 - y, 100, 100);

  // Handle movement
  if (keyIsDown(LEFT_ARROW) || keyIsDown(65)) { // A
    x -= speed;
  }
  if (keyIsDown(RIGHT_ARROW) || keyIsDown(68)) { // D
    x += speed;
  }
  if (keyIsDown(UP_ARROW) || keyIsDown(87)) { // W
    y += speed;
  }
  if (keyIsDown(DOWN_ARROW) || keyIsDown(83)) { // S
    y -= speed;
  }
}

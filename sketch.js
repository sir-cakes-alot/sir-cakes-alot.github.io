function setup() {
  createCanvas(1000, 400);
  background(0);
}
var test = 0;

function draw() {
  fill(255);
  test = test>100 ? 0 :test+1;
  ellipse(test+(width/2), (height/2)-test, 100, 100);
}

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants/game';
import { Vector2 } from './vector2';

export class Camera {
  constructor(public position: Vector2) {}

  update(target: Vector2) {
    // Camera follows the target (player)
    this.position = target;
  }

  getOffset(): Vector2 {
    return new Vector2(this.position.x - CANVAS_WIDTH / 2, this.position.y - CANVAS_HEIGHT / 2);
  }
}

// Entity Component System Architecture

let nextEntityId = 0;

export class Entity {
  constructor() {
    this.id = nextEntityId++;
    this.components = new Map();
  }

  addComponent(component) {
    this.components.set(component.constructor.name, component);
    component.entity = this;
    return this;
  }

  getComponent(componentClass) {
    return this.components.get(componentClass.name);
  }

  hasComponent(componentClass) {
    return this.components.has(componentClass.name);
  }

  removeComponent(componentClass) {
    this.components.delete(componentClass.name);
  }
}

export class World {
  constructor() {
    this.entities = new Map();
    this.systems = [];
  }

  createEntity() {
    const entity = new Entity();
    this.entities.set(entity.id, entity);
    return entity;
  }

  removeEntity(entity) {
    this.entities.delete(entity.id);
  }

  addSystem(system) {
    system.world = this;
    this.systems.push(system);
    return this;
  }

  update(deltaTime) {
    this.systems.forEach(system => system.update(deltaTime));
  }

  getEntitiesWith(...componentClasses) {
    const entities = [];
    for (const entity of this.entities.values()) {
      if (componentClasses.every(cls => entity.hasComponent(cls))) {
        entities.push(entity);
      }
    }
    return entities;
  }
}

// Base System class
export class System {
  constructor() {
    this.world = null;
  }

  update(deltaTime) {
    // Override in subclasses
  }
}

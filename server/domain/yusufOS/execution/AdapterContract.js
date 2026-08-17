class GovernedAdapter {
  descriptor() {
    throw new Error("Adapter descriptor() is not implemented.");
  }
  async availability() {
    throw new Error("Adapter availability() is not implemented.");
  }
  async preflight() {
    throw new Error("Adapter preflight() is not implemented.");
  }
  async prepare() {
    throw new Error("Adapter prepare() is not implemented.");
  }
  async execute() {
    throw new Error("Adapter execute() is not implemented.");
  }
  async verify() {
    throw new Error("Adapter verify() is not implemented.");
  }
  async reconcile() {
    throw new Error("Adapter reconcile() is not implemented.");
  }
}

module.exports = { GovernedAdapter };

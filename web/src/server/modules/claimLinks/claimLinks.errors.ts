export class ClaimLinkNotFoundError extends Error {
  constructor() {
    super("Claim link not found.");
    this.name = "ClaimLinkNotFoundError";
  }
}

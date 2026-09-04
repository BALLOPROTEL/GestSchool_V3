export interface StorageHealth {
  check(): Promise<void>;
  readonly name: 'storage';
}

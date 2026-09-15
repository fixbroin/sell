// src/lib/timestamp.ts

export class Timestamp {
  seconds: number;
  nanoseconds: number;
  
  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }
  
  static now() {
    return Timestamp.fromDate(new Date());
  }
  
  static fromDate(date: Date) {
    return new Timestamp(Math.floor(date.getTime() / 1000), 0);
  }
  
  static fromMillis(ms: number) {
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1000000);
  }
  
  toDate() {
    return new Date(this.seconds * 1000);
  }
  
  toMillis() {
    return this.seconds * 1000;
  }
  
  toISOString() {
    return this.toDate().toISOString();
  }
}

export function isTimestamp(val: any): boolean {
  return !!(
    val &&
    typeof val === 'object' &&
    ((typeof val.seconds === 'number' && typeof val.nanoseconds === 'number') ||
      (typeof val._seconds === 'number' && typeof val._nanoseconds === 'number') ||
      (typeof val.toDate === 'function'))
  );
}

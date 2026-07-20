export class SVY21 {
  private a = 6378137;
  private f = 1 / 298.257223563;

  private oLat = 1.366666; // Origin Latitude (decimal degrees)
  private oLon = 103.833333; // Central Meridian (decimal degrees)
  private oN = 38744.572; // False Northing (m)
  private oE = 28001.642; // False Easting (m)
  private k = 1.0; // Scale Factor

  private b: number;
  private e2: number;
  private e4: number;
  private e6: number;
  private A0: number;
  private A2: number;
  private A4: number;
  private A6: number;

  constructor() {
    this.b = this.a * (1 - this.f);
    this.e2 = (2 * this.f) - (this.f * this.f);
    this.e4 = this.e2 * this.e2;
    this.e6 = this.e4 * this.e2;

    this.A0 = 1 - (this.e2 / 4) - (3 * this.e4 / 64) - (5 * this.e6 / 256);
    this.A2 = (3 / 8) * (this.e2 + (this.e4 / 4) + (15 * this.e6 / 128));
    this.A4 = (15 / 256) * (this.e4 + (3 * this.e6 / 4));
    this.A6 = (35 / 3072) * this.e6;
  }

  private calcM(latRad: number): number {
    return this.a * (
      (this.A0 * latRad) -
      (this.A2 * Math.sin(2 * latRad)) +
      (this.A4 * Math.sin(4 * latRad)) -
      (this.A6 * Math.sin(6 * latRad))
    );
  }

  public computeLatLon(N: number, E: number): { lat: number; lng: number } {
    const oLatRad = this.oLat * Math.PI / 180;
    const mOrig = this.calcM(oLatRad);
    const m = mOrig + (N - this.oN) / this.k;

    const mu = m / (this.a * this.A0);
    const e1 = (1 - Math.sqrt(1 - this.e2)) / (1 + Math.sqrt(1 - this.e2));

    const J1 = (3 * e1 / 2) - (27 * e1 * e1 * e1 / 32);
    const J2 = (21 * e1 * e1 / 16) - (55 * e1 * e1 * e1 * e1 / 32);
    const J3 = (151 * e1 * e1 * e1 / 96);
    const J4 = (1097 * e1 * e1 * e1 * e1 / 512);

    const fp = mu + J1 * Math.sin(2 * mu) + J2 * Math.sin(4 * mu) + J3 * Math.sin(6 * mu) + J4 * Math.sin(8 * mu);

    const sinFp = Math.sin(fp);
    const cosFp = Math.cos(fp);
    const tanFp = Math.tan(fp);

    const C1 = (this.e2 / (1 - this.e2)) * cosFp * cosFp;
    const T1 = tanFp * tanFp;
    const R1 = this.a * (1 - this.e2) / Math.pow(1 - this.e2 * sinFp * sinFp, 1.5);
    const N1 = this.a / Math.sqrt(1 - this.e2 * sinFp * sinFp);
    const D = (E - this.oE) / (N1 * this.k);

    const Q1 = D;
    const Q2 = (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * (this.e2 / (1 - this.e2)) * T1) * D * D * D / 6;
    const Q3 = (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 3 * C1 * C1 - 252 * (this.e2 / (1 - this.e2)) * T1) * D * D * D * D * D / 120;
    const lat = fp - (N1 * tanFp / R1) * (Q1 * Q1 / 2 - Q2 + Q3);

    const L1 = D;
    const L2 = (1 + 2 * T1 + C1) * D * D * D / 6;
    const L3 = (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * C1 * T1 + 24 * T1 * T1) * D * D * D * D * D / 120;
    const lon = (this.oLon * Math.PI / 180) + (L1 - L2 + L3) / cosFp;

    return {
      lat: lat * 180 / Math.PI,
      lng: lon * 180 / Math.PI
    };
  }
}

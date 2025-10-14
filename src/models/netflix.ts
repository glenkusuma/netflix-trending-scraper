import { Schema, model, models, type Model } from 'mongoose';

export type Top10Category = 'movies_en' | 'movies_non_en' | 'shows_en' | 'shows_non_en';

export interface NetflixTop10Row {
  rank: number;
  title: string;
  weeksInTop10: number | null;
  views: { raw: string | null; value: number | null };
  runtime: { raw: string | null; minutes: number | null };
  hoursViewed: { raw: string | null; value: number | null };
}

export interface NetflixTop10Snapshot {
  _id?: any;
  sourceUrl: string;
  country: string;
  category: Top10Category;
  categoryLabel: string;
  timeWindowRaw: string | null;
  scrapedAt: Date;
  data: NetflixTop10Row[];
  createdAt?: Date;
  updatedAt?: Date;
}

const RowSchema = new Schema<NetflixTop10Row>(
  {
    rank: { type: Number, required: true },
    title: { type: String, required: true },
    weeksInTop10: { type: Number, required: false },
    views: { raw: { type: String }, value: { type: Number } },
    runtime: { raw: { type: String }, minutes: { type: Number } },
    hoursViewed: { raw: { type: String }, value: { type: Number } },
  },
  { _id: false }
);

const NetflixSnapshotSchema = new Schema<NetflixTop10Snapshot>(
  {
    sourceUrl: { type: String, required: true },
    country: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    categoryLabel: { type: String, required: true },
    timeWindowRaw: { type: String },
    scrapedAt: { type: Date, required: true, index: true },
    data: { type: [RowSchema], required: true },
  },
  { timestamps: true, collection: 'netflix_top10_snapshots' }
);

NetflixSnapshotSchema.index({ country: 1, category: 1, scrapedAt: -1 });

export const NetflixTop10SnapshotModel: Model<NetflixTop10Snapshot> =
  (models.NetflixTop10Snapshot as Model<NetflixTop10Snapshot>) ||
  model<NetflixTop10Snapshot>('NetflixTop10Snapshot', NetflixSnapshotSchema);

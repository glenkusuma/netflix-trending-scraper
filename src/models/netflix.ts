import { Schema, model, models, type Model } from 'mongoose';

export type Top10Category =
  | 'movies_en'
  | 'movies_non_en'
  | 'shows_en'
  | 'shows_non_en'
  | 'shows'
  | 'movies';

// Row shape aligned with scraper Top10Row
export type Top10Row = {
  rank: number;
  title: string;
  weeksInTop10: number | null;
  views: number | null;
  runtimeSecond: number | null;
  hoursViewed: number | null;
};

// Result/meta shape aligned with scraper Top10Result
export type Top10Result = {
  meta: {
    title: string;
    sourceUrl: string;
    global: boolean;
    country: string | null;
    category: Top10Category;
    timeWindow: {
      type: 'weekly' | 'alltime' | null;
      startDate: string | null;
      endDate: string | null;
      year: number | null;
    };
    length: number;
    scrapedAt: string;
  };
  data: Top10Row[];
};

export interface NetflixTop10Snapshot {
  _id?: string;
  fmt?: string;
  title?: string;
  sourceUrl: string;
  global: boolean;
  country: string | null;
  category: Top10Category;
  timeWindow: {
    type: 'weekly' | 'alltime' | null;
    startDate: string | null;
    endDate: string | null;
    year: number | null;
  };
  length: number;
  scrapedAt: Date;
  data: Top10Row[];
  createdAt?: Date;
  updatedAt?: Date;
}

const RowSchema = new Schema<Top10Row>(
  {
    rank: { type: Number, required: true },
    title: { type: String, required: true },
    weeksInTop10: { type: Number, required: false, default: null },
    views: { type: Number, required: false, default: null },
    runtimeSecond: { type: Number, required: false, default: null },
    hoursViewed: { type: Number, required: false, default: null },
  },
  { _id: false }
);

const NetflixSnapshotSchema = new Schema<NetflixTop10Snapshot>(
  {
    _id: { type: String },
    fmt: { type: String, required: false, default: null },
    title: { type: String, required: true },
    sourceUrl: { type: String, required: true },
    global: { type: Boolean, required: true, index: true },
    country: { type: String, required: false, default: null, index: true },
    category: { type: String, required: true, index: true },
    timeWindow: {
      type: {
        type: String,
        enum: ['weekly', 'alltime', null],
        default: null,
      },
      startDate: { type: String, default: null },
      endDate: { type: String, default: null },
      year: { type: Number, default: null },
    } as any,
    length: { type: Number, required: true },
    scrapedAt: { type: Date, required: true, index: true },
    data: { type: [RowSchema], required: true },
  },
  { timestamps: true, collection: 'netflix_top10' }
);

NetflixSnapshotSchema.index({ country: 1, category: 1, scrapedAt: -1 });

export const NetflixTop10SnapshotModel: Model<NetflixTop10Snapshot> =
  (models.NetflixTop10Snapshot as Model<NetflixTop10Snapshot>) ||
  model<NetflixTop10Snapshot>('NetflixTop10Snapshot', NetflixSnapshotSchema);

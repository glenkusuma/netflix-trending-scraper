import { Schema, model, models, type Model } from 'mongoose';
import { Top10Row } from './netflix';
import { DataSchema } from './imdb';

const RowSchema = new Schema<Top10Row>(
  {
    rank: { type: Number, required: true },
    title: { type: String, required: true },
    weeksInTop10: { type: Number, required: false, default: null },
    views: { type: Number, required: false, default: null },
    runtimeSecond: { type: Number, required: false, default: null },
    hoursViewed: { type: Number, required: false, default: null },
    ...((DataSchema as any).obj || {}),
  },
  { _id: false }
);

const NetflixImdbSchema = new Schema<any>(
  {
    _id: { type: String },
    src: { type: String, required: false, default: 'netflix' },
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
  { timestamps: true, collection: 'netflix_imdb' }
);

// Text index for fast title searching across the top-level title and nested data.title
// Title gets higher weight than nested row titles.
NetflixImdbSchema.index(
  { title: 'text', 'data.title': 'text' },
  { name: 'netflix_imdb_text_idx', weights: { title: 5, 'data.title': 1 } }
);

// Compound index to support fast filtering by country + category with pagination by _id
NetflixImdbSchema.index(
  { country: 1, category: 1, _id: -1 },
  { name: 'netflix_imdb_country_category_idx' }
);

export const NetflixImdbModel: Model<any> =
  (models.NetflixImdbModel as Model<any>) || model<any>('NetflixImdbModel', NetflixImdbSchema);

import { Schema, model, models, type Model } from 'mongoose';

// Shared sub-types
export type ImdbImage = {
  url: string;
  width?: number;
  height?: number;
  type?: string;
};

export type ImdbPerson = {
  id: string;
  displayName: string;
  alternativeNames?: string[];
  primaryImage?: ImdbImage;
  primaryProfessions?: string[];
};

export type ImdbCountry = { code: string; name: string };
export type ImdbLanguage = { code: string; name: string };
export type ImdbInterest = { id: string; name: string; isSubgenre?: boolean };

export type ImdbRating = { aggregateRating?: number; voteCount?: number };
export type ImdbMetacritic = { score?: number; reviewCount?: number };

// Main IMDb title data shape (based on the provided sample)
export interface ImdbTitleData {
  id: string; // e.g., tt14539740
  type?: string; // movie, tvSeries, etc.
  primaryTitle?: string;
  originalTitle?: string;
  primaryImage?: ImdbImage;
  startYear?: number;
  endYear?: number;
  runtimeSeconds?: number;
  genres?: string[];
  rating?: ImdbRating;
  metacritic?: ImdbMetacritic;
  plot?: string;
  directors?: ImdbPerson[];
  writers?: ImdbPerson[];
  stars?: ImdbPerson[];
  originCountries?: ImdbCountry[];
  spokenLanguages?: ImdbLanguage[];
  interests?: ImdbInterest[];
}

export interface ImdbTitleDoc extends ImdbTitleData {
  _id?: any;
  titleId: string; // duplicated from id for indexing/search
  createdAt?: Date;
  updatedAt?: Date;
}

// Sub-schemas (no _id for embedded docs)
const ImageSchema = new Schema<ImdbImage>(
  {
    url: { type: String, required: true },
    width: { type: Number },
    height: { type: Number },
    type: { type: String },
  },
  { _id: false, strict: false }
);

const PersonSchema = new Schema<ImdbPerson>(
  {
    id: { type: String, required: true },
    displayName: { type: String, required: true },
    alternativeNames: { type: [String], required: false },
    primaryImage: { type: ImageSchema, required: false },
    primaryProfessions: { type: [String], required: false },
  },
  { _id: false, strict: false }
);

const CountrySchema = new Schema<ImdbCountry>(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
  },
  { _id: false }
);

const LanguageSchema = new Schema<ImdbLanguage>(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
  },
  { _id: false }
);

const InterestSchema = new Schema<ImdbInterest>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    isSubgenre: { type: Boolean, required: false },
  },
  { _id: false }
);

const RatingSchema = new Schema<ImdbRating>(
  {
    aggregateRating: { type: Number },
    voteCount: { type: Number },
  },
  { _id: false }
);

const MetacriticSchema = new Schema<ImdbMetacritic>(
  {
    score: { type: Number },
    reviewCount: { type: Number },
  },
  { _id: false }
);

const DataSchema = new Schema<ImdbTitleData>(
  {
    id: { type: String, required: true },
    type: { type: String },
    primaryTitle: { type: String },
    originalTitle: { type: String },
    primaryImage: { type: ImageSchema },
    startYear: { type: Number },
    endYear: { type: Number },
    runtimeSeconds: { type: Number },
    genres: { type: [String] },
    rating: { type: RatingSchema },
    metacritic: { type: MetacriticSchema },
    plot: { type: String },
    directors: { type: [PersonSchema] },
    writers: { type: [PersonSchema] },
    stars: { type: [PersonSchema] },
    originCountries: { type: [CountrySchema] },
    spokenLanguages: { type: [LanguageSchema] },
    interests: { type: [InterestSchema] },
  },
  // Allow extra properties from upstream without rejecting (future-proof)
  { _id: false, strict: false }
);

const ImdbTitleDocSchema = new Schema<ImdbTitleDoc>(
  {
    _id: { type: String, required: true},
    src: { type: String, required: false, default: 'imdb_api' },
    fmt: { type: String, required: false, default: 'json' },
    // Merge fields from DataSchema at the top level
    ...((DataSchema as any).obj || {}),
  },
  // Allow unknown fields to pass through to support API shape changes
  { timestamps: true, collection: 'imdb', strict: false }
);

export const ImdbTitleModel: Model<ImdbTitleDoc> =
  (models.ImdbTitleDoc as Model<ImdbTitleDoc>) ||
  model<ImdbTitleDoc>('ImdbTitleDoc', ImdbTitleDocSchema);

export { DataSchema };
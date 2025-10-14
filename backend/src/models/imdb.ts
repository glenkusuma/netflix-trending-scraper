import { Schema, model, models, type Model } from 'mongoose';

export interface ImdbTitleDoc {
  _id?: any;
  titleId: string;
  data: any;
  createdAt?: Date;
  updatedAt?: Date;
}

const ImdbTitleDocSchema = new Schema<ImdbTitleDoc>(
  {
    titleId: { type: String, required: true, unique: true, index: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, collection: 'imdb_title_docs' }
);

export const ImdbTitleModel: Model<ImdbTitleDoc> =
  (models.ImdbTitleDoc as Model<ImdbTitleDoc>) || model<ImdbTitleDoc>('ImdbTitleDoc', ImdbTitleDocSchema);

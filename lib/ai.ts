// Future server-side adapter. Never instantiate a paid provider in a client component.
// Providers must validate generated recipes, sources, allergens, and nutrition before saving.
import type {Profile,Recipe} from './types';
export interface RecipeGenerator {generate(input:{profile:Profile;prompt:string}):Promise<Recipe>}
export type GeneratorResult={status:'unconfigured'}|{status:'available';provider:RecipeGenerator};
export function getRecipeGenerator():GeneratorResult{return {status:'unconfigured'};}

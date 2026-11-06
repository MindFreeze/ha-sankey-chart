import * as cz from './editor/cz.json';
import * as en from './editor/en.json';
import * as pt from './editor/pt-BR.json';
import * as sk from './editor/sk.json';
import { registerTranslations } from './localize';

registerTranslations({ en, cz, sk, pt });

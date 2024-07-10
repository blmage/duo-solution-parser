import { _, it, lift } from 'param.macro';
import { cartesianProduct, groupBy, hasObjectProperty } from 'duo-toolbox/utils/functions';

type Solution = {
  /** The language in which the solution is written. */
  locale: string;
  /** The first variation of the solution, usable as a reference and for sorting. */
  reference: string;
  /** The tokens for building all the possible variations of the solution. */
  tokens: string[][];
  /** Whether the solution contains at least one token with multiple values. */
  isComplex: boolean;
}

type PatternBranch = {
  /** The tokens that are shared by all the solutions based on the branch. */
  sharedTokens: string[];
  /** The possible tokens at the start of the branch (if there is a choice first). */
  firstChoice: string[];
  /** The possible tokens at the end of the branch (if there is a choice last). */
  lastChoice: string[];
} & {
  /** A flag used when building patterns. Specifies where title case should be enforced. */
  shouldTitleCaseNextNonSpaceToken?: boolean;
};

type PatternBranchSet = {
  /** The number of solutions that stem from each branch of the set. */
  branchSize: number;
  /** The position of the branches tokens relative to the pattern shared tokens. */
  tokenPosition: number;
  /** The branches that build up the paths leading to different solutions. */
  branches: PatternBranch[];
};

type Pattern = {
  /** The number of solutions that the pattern can generate. */
  size: number;
  /** The tokens that are shared by all the generated solutions. */
  sharedTokens: string[];
  /** The sets of branches that build up the paths leading to different solutions. */
  branchSets: PatternBranchSet[];
};

type PatternSet = {
  /** The locale of the generated solutions. */
  locale: string;
  /** The number of solutions that the patterns can generate. */
  size: number;
  /** The patterns that can be used to generate all the solutions. */
  patterns: Pattern[];
}

const getPatternSolution = (pattern: Pattern, solutionIx: number, locale: string): Solution => {
  const tokens = [] as string[][];
  let position = 0;
  let reference = '';
  let isComplex = false;
  let shouldTitleCaseNextNonSpaceToken = false;

  const appendTokenToResult = (token: string | string[]) => {
    if (Array.isArray(token)) {
      if (shouldTitleCaseNextNonSpaceToken) {
        // No need to check for whitespace here - choices can not be only made up of whitespace.
        shouldTitleCaseNextNonSpaceToken = false;
        token = token.map(it.replace(/[\p{L}\p{N}]/u, it.toLocaleUpperCase(locale)));
      }

      tokens.push(token);
      reference += token[0];
    } else {
      if (shouldTitleCaseNextNonSpaceToken && (token.trim() !== '')) {
        shouldTitleCaseNextNonSpaceToken = false;
        token = token.replace(/[\p{L}\p{N}]/u, it.toLocaleUpperCase(locale));
      }

      reference += token;
      tokens.push([ token ]);
    }
  };

  for (const branchSet of pattern.branchSets) {
    for (let i = position; i < branchSet.tokenPosition; i++) {
      appendTokenToResult(pattern.sharedTokens[i]);
    }

    const branch = branchSet.branches[Math.floor(solutionIx / branchSet.branchSize)];

    if (branch.firstChoice.length > 0) {
      isComplex = true;
      appendTokenToResult(branch.firstChoice.sort(compareTokenStringsCi))
    }

    if (branch.sharedTokens.length > 0) {
      for (const token of branch.sharedTokens) {
        appendTokenToResult(token);
      }
    }

    if (branch.lastChoice.length > 0) {
      isComplex = true;
      appendTokenToResult(branch.lastChoice.sort(compareTokenStringsCi));
    }

    position = branchSet.tokenPosition;
    solutionIx = solutionIx % branchSet.branchSize;
    shouldTitleCaseNextNonSpaceToken = shouldTitleCaseNextNonSpaceToken || !!branch.shouldTitleCaseNextNonSpaceToken;
  }

  for (let i = position; i < pattern.sharedTokens.length; i++) {
    appendTokenToResult(pattern.sharedTokens[i]);
  }

  return {
    locale,
    reference,
    tokens,
    isComplex,
  };
};

export const getPatternSetSolution = (patternSet: PatternSet, solutionIx: number): Solution | null => {
  for (const pattern of patternSet.patterns) {
    if (solutionIx >= pattern.size) {
      solutionIx -= pattern.size;
    } else {
      return getPatternSolution(
        pattern,
        solutionIx,
        patternSet.locale
      );
    }
  }

  return null;
};

const getParsedSolutions = (solutions: string[], locale: string): Solution[] => {
  const patternSet = {
    locale,
    size: 0,
    patterns: [],
  } as PatternSet;

  const hasWhitespaces = ![ 'ja', 'zh-CN', 'zh-Hans' ].includes(locale);
  let sentences = solutions.map(it.normalize('NFC')) as string[];

  const splitTokens = !hasWhitespaces
    ? [ it ]
    : it.split(/([^\p{L}\p{N}]+)/u);

  const prepareTokens = splitTokens(_).filter('' !== it);

  for (const sentence of sentences) {
    let index = 0;
    const branchSets = [] as PatternBranchSet[];
    const sharedTokens = [];

    const choiceSets = sentence.matchAll(
      !hasWhitespaces
        ? /\[([^\]]+)\]/ug
        : /([^\s[]*\[[^[]+\][^\s[]*)+/ug
    );

    for (const choiceSet of choiceSets) {
      if ((choiceSet.index ?? 0) > index) {
        const common = sentence.substring(index, choiceSet.index);

        if ('' !== common) {
          const tokens = prepareTokens(common);
          sharedTokens.push(...tokens);
        }
      }

      let choiceGroups = [] as string[][][];

      const isNewSentence = hasWhitespaces && (
        (sharedTokens.length === 0)
        || !!sharedTokens.at(-1).match(/\p{Sentence_Terminal}\s*$/ug)
      );

      if (hasWhitespaces) {
        // Build all full choices (that may be made up of smaller parts).
        let choices = [ '' ];
        let subIndex = 0;
        const subsets = choiceSet[0].matchAll(/\[([^[]+)]/g);

        for (const subset of subsets) {
          if ((subset.index ?? 0) > subIndex) {
            const common = choiceSet[0].substring(subIndex, subset.index);
            choices = choices.map(choice => `${choice}${common}`);
          }

          const subChoices = subset[1].split(/\//);
          choices = subChoices.flatMap(sub => choices.map(choice => `${choice}${sub}`));
          subIndex = (subset.index ?? 0) + subset[0].length;
        }

        if (subIndex < choiceSet[0].length) {
          const [ , common, punctuation ] = choiceSet[0].substring(subIndex).match(/(.*?)([^\p{L}\p{N}]*)$/u) ?? [];
          choices = choices.map(choice => `${choice}${common}`);

          if (punctuation.length > 0) {
            // Avoid adding end punctuation to all choices.
            choiceSet[0] = choiceSet[0].slice(0, -punctuation.length);
          }
        }

        choices.sort((x, y) => compareStringsCi(x, y, locale));
        choiceGroups = groupBy(choices.map(prepareTokens), it.length);
      } else {
        choiceGroups = groupBy(choiceSet[1].split(/\//).map(prepareTokens), it.length);
      }

      const branches = [] as PatternBranch[];

      // Attempt to reduce the final number of solutions by grouping the choices that share all but 1 or 2 tokens.
      const choiceEntries = Object.entries(choiceGroups);

      for (const [ lengthKey, subChoices ] of choiceEntries) {
        const length = Number(lengthKey);

        if (length > 1) {
          const choiceKeys = Array.from(subChoices.keys());

          // Keys to choices where only the first token varies.
          const sameSuffixGroups = Object.values(
            groupBy(choiceKeys, (ix: number) => subChoices[ix].slice(1).join(''))
          ).filter(lift(_.length > 1)) as number[][];

          // Keys to choices where only the last token varies.
          const samePrefixGroups = Object.values(
            groupBy(choiceKeys, (ix: number) => subChoices[ix].slice(0, -1).join(''))
          ).filter(lift(_.length > 1)) as number[][];

          const handledChoiceKeys = new Set();

          /**
           * Attempt to group choices that share the same infix,
           * and with which every combination of prefix and suffix is represented.
           *
           * This is useful for cases like: "[diesen Karton/den Karton/diesen Kasten/den Kasten]"
           * that can be further optimized to: "[diesen/den] [Karton/Kasten]"
           * instead of just: "[diesen/den] Karton" + "[diesen/den] Kasten".
           */
          if (hasWhitespaces && (length >= 3)) {
            const sameInfixGroups = Object.values(
              groupBy(choiceKeys, (ix: number) => subChoices[ix].slice(1, -1).join(''))
            ).filter(lift(_.length > 1)) as number[][];

            for (const sameInfixGroup of sameInfixGroups) {
              const sameInfixSameSuffixGroups = Object.values(
                groupBy(sameInfixGroup, (ix: number) => subChoices[ix].slice(1).join(''))
              ).filter(lift(_.length > 1)) as number[][];

              const sameSuffixPrefixes = sameInfixSameSuffixGroups.map(
                it.map(subChoices[it][1].match(/\s/) && subChoices[it][0]).filter(Boolean)
              ) as string[][];

              const sameAffixesGroups = Object.values(
                groupBy(Array.from(sameSuffixPrefixes.keys()), sameSuffixPrefixes[it].join('/'))
              ).filter(lift(_.length > 1)) as number[][];

              for (const keys of sameAffixesGroups) {
                branches.push(
                  {
                    sharedTokens: subChoices[sameSuffixGroups[keys[0]][0]].slice(1, -1),
                    firstChoice: sameSuffixGroups[keys[0]].map(ix => subChoices[ix][0]),
                    // @ts-ignore
                    lastChoice: keys.map(ix => subChoices[sameSuffixGroups[ix][0]].at(-1)),
                  }
                );

                keys
                  .flatMap(ix => sameSuffixGroups[ix])
                  .forEach(xs => handledChoiceKeys.add(xs));
              }
            }
          }

          // We prioritize grouping on suffixes over grouping on prefixes. This is an arbitrary choice,
          // there is no further optimization to be done w.r.t. to the resulting number of solutions.
          for (let keys of sameSuffixGroups) {
            keys = keys.filter(key => !handledChoiceKeys.has(key));

            if (keys.length > 1) {
              const choiceTokens = keys
                .map(ix => subChoices[ix][0])
                .sort((x, y) => compareStringsCi(x, y, locale));

              branches.push(
                {
                  sharedTokens: subChoices[keys[0]].slice(1),
                  firstChoice: choiceTokens,
                  lastChoice: [],
                }
              );

              keys.forEach(xs => handledChoiceKeys.add(xs));
            }
          }

          for (let keys of samePrefixGroups) {
            keys = keys.filter(key => !handledChoiceKeys.has(key));

            if (keys.length > 1) {
              const choiceTokens = keys
                .map(ix => subChoices[ix].at(-1))
                // @ts-ignore
                .sort((x, y) => compareStringsCi(x, y, locale)) as string[];

              branches.push(
                {
                  sharedTokens: subChoices[keys[0]].slice(0, -1),
                  firstChoice: [],
                  lastChoice: choiceTokens,
                }
              );

              keys.forEach(key => handledChoiceKeys.add(key));
            }
          }

          for (const key of choiceKeys) {
            if (!handledChoiceKeys.has(key)) {
              branches.push(
                {
                  sharedTokens: subChoices[key],
                  firstChoice: [],
                  lastChoice: [],
                }
              );
            }
          }
        } else {
          /**
           * When there is an empty choice at the start of a sentence,
           * the sentence in the corresponding solutions will actually start on the first next non-space token.
           * Remember to adapt the capitalization of the corresponding token,
           * if it seems preferable given the capitalization of the other non-empty choices.
           */
          const shouldTitleCaseNextNonSpaceToken = (
            isNewSentence
            && (length === 0)
            && choiceEntries.every((it[0] === lengthKey) || it[1].some(it[0]?.match(/^\s*[\p{N}\p{Lu}]/ug)))
          );

          branches.push(
            {
              sharedTokens: [],
              firstChoice: subChoices.flat(),
              lastChoice: [],
              shouldTitleCaseNextNonSpaceToken,
            }
          );
        }
      }

      branchSets.push(
        {
          branchSize: 0,
          branches,
          tokenPosition: sharedTokens.length,
        }
      );

      index = (choiceSet.index ?? 0) + choiceSet[0].length;
    }

    if (index < sentence.length) {
      const common = sentence.substring(index);
      const tokens = prepareTokens(common);
      sharedTokens.push(...tokens);
    }

    let size = 1;

    for (let i = branchSets.length - 1; i >= 0; i--) {
      branchSets[i].branchSize = size;
      size = branchSets[i].branches.length * size;

      for (const branch of branchSets[i].branches) {
        if (1 === branch.firstChoice.length) {
          // @ts-ignore
          branch.sharedTokens.unshift(branch.firstChoice.pop());
        }

        if (1 === branch.lastChoice.length) {
          // @ts-ignore
          branch.sharedTokens.push(branch.lastChoice.pop());
        }
      }
    }

    patternSet.patterns.push(
      {
        size,
        branchSets,
        sharedTokens,
      }
    );
  }

  patternSet.size = patternSet.patterns.reduce(lift(_ + _.size), 0);

  // Generating solutions one by one seems to actually be quite efficient.
  const parsedSolutions = [] as Solution[];

  for (let i = 0; i < patternSet.size; i++) {
    const solution = getPatternSetSolution(patternSet, i);

    if (solution) {
      parsedSolutions.push(solution);
    }
  }

  // The token comparison cache could get quite big, so let's clear it.
  compareTokenStringsCi.clearCache();

  return parsedSolutions;
};

export const getUnfoldedParsedSolutions = (solutions: string[], locale: string): string[] => {
  const parsed = getParsedSolutions(solutions, locale);
  const sentences = [];

  for (const solution of parsed) {
    sentences.push(
      ...cartesianProduct(solution.tokens)
        .map((token: string[]) => token.join('').trim().replaceAll(/(\s)\1+/g, '$1'))
    );
  }

  return sentences;
};

const compareStringsCi = (x: string, y: string, locale: string) => (
  x.localeCompare(y, locale, {
    ignorePunctuation: true,
    numeric: true,
    sensitivity: 'accent',
    usage: 'sort',
    caseFirst: 'upper',
  })
);

type MemoizedCache = {
  [key: string]: any;
};

type MemoizedStringFunction = {
  clearCache: Function;
  (...xs: string[]): any;
};

const memoizeStringFunction = (fn: Function, isSingleArity = false): MemoizedStringFunction => {
  let cache = {} as MemoizedCache;
  let memoized: MemoizedStringFunction

  if (isSingleArity) {
    memoized = ((x: string) => {
      if (!hasObjectProperty(cache, x)) {
        cache[x] = fn(x);
      }

      return cache[x];
    }) as MemoizedStringFunction;
  } else {
    memoized = ((...args) => {
      const key = args.join('\x1f');

      if (!hasObjectProperty(cache, key)) {
        cache[key] = fn(...args);
      }

      return cache[key];
    }) as MemoizedStringFunction;
  }

  memoized.clearCache = () => {
    cache = {};
  };

  return memoized;
};

const compareTokenStringsCi = memoizeStringFunction(compareStringsCi);
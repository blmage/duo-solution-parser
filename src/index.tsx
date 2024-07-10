import { h, render } from 'preact';
import { useCallback, useState } from 'preact/hooks';
import { useLocalStorage } from 'usehooks-ts';
import { it } from 'param.macro';
import useClipboard from 'react-use-clipboard';
import { CheckIcon, ClipboardIcon, FolderArrowDownIcon, TrashIcon } from '@heroicons/react/24/outline';
import { triggerContentDownload } from 'duo-toolbox/utils/ui';
import LOCALES from './locales';
import { getUnfoldedParsedSolutions } from './solutions';
import './index.css';

render(<App />, document.getElementById('root') as HTMLElement)

function App() {
  const [ locale, setLocale ] = useLocalStorage('locale', 'en');
  const [ rawSolutions, setRawSolutions ] = useState('');
  const [ parsedSolutions, setParsedSolutions ] = useState('');
  const [ isSolutionsCopied, copySolutions ] = useClipboard(parsedSolutions, { successDuration: 1000 });

  const resetSolutions = useCallback(() => {
    if (confirm('Are you sure you want to reset the form?')) {
      setRawSolutions('');
      setParsedSolutions('');
    }
  }, [ setRawSolutions, setParsedSolutions ]);

  const parseSolutions = useCallback(() => {
    setParsedSolutions(
      getUnfoldedParsedSolutions(
        rawSolutions.split('\n').filter(Boolean),
        locale
      ).join('\n')
    );
  }, [ locale, rawSolutions, setParsedSolutions ])

  const exportSolutions = useCallback(() => {
    triggerContentDownload(
      parsedSolutions.split('\n').map(`"${it}"`).join('\n'),
      'application/csv',
      'solutions.csv'
    );
  }, [ parsedSolutions ]);

  return (
    <div class="min-w-screen h-screen p-4 bg-gray-100 grid grid-rows-[1fr_5rem_1fr] gap-1">
      <textarea
        value={rawSolutions}
        onChange={e => setRawSolutions(e.currentTarget.value)}
        placeholder="Enter solution patterns here..."
        class="w-full h-full bg-white p-4 border border-gray-300 rounded-lg resize-none"
      />

      <div class="w-full h-20 py-4 grid grid-cols-3 gap-4">
        <div class="flex">
          <select
            placeholder="Locale"
            onChange={e => setLocale(e.currentTarget.value)}
            className={`w-fit h-full px-4 bg-white border border-gray-300 rounded-lg`}
          >
            <option value="" disabled>Choose Your Locale</option>
            {LOCALES.map(([ code, name ]) => (
              <option
                key={code}
                value={code}
                selected={locale === code}
              >
                {name}
              </option>
            ))}
          </select>
        </div>

        <div class="flex justify-center items-center">
          <button
            onClick={parseSolutions}
            class="w-full max-w-48 h-full px-12 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg"
          >
            Run
          </button>
        </div>

        <div class="flex justify-end gap-4">
          <button
            onClick={copySolutions}
            class="w-12 h-12 bg-white hover:bg-gray-700 text-gray-700 hover:text-white rounded-lg border border-gray-300"
          >
            {isSolutionsCopied
              ? <CheckIcon class="h-6 w-6 m-auto" />
              : <ClipboardIcon class="h-6 w-6 m-auto" />}
          </button>

          <button
            onClick={exportSolutions}
            className="w-12 h-12 bg-white hover:bg-gray-700 border border-gray-300 text-gray-700 hover:text-white rounded-lg"
          >
            <FolderArrowDownIcon class="h-6 w-6 m-auto" />
          </button>

          <button
            onClick={resetSolutions}
            class="w-12 h-12 bg-red-500 hover:bg-red-700 border border-red-700 text-white rounded-lg"
          >
            <TrashIcon class="h-6 w-6 m-auto" />
          </button>
        </div>
      </div>

      <div className="flex w-full h-full p-4 bg-white border border-gray-300 rounded-lg overflow-y-auto whitespace-pre-line">
        <div className="w-full h-full overflow-y-auto">
          {parsedSolutions || <span class="text-gray-400">Expanded solutions will be shown here...</span>}
        </div>
      </div>
    </div>
  )
}

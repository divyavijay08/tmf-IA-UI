"""Package the current evaluator, without embedding historical evidence."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / 'public/downloads/alpha-independent-reproduction.zip'


def build(target=TARGET):
    files = {
        'controlQuery.ts': ROOT / 'src/controlQuery.ts',
        'assuranceData.ts': ROOT / 'src/assuranceData.ts',
        'workflowJourney.ts': ROOT / 'src/workflowJourney.ts',
        'reproduce.mjs': ROOT / 'scripts/offline/reproduce.mjs',
        'README.txt': ROOT / 'scripts/offline/README.txt',
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(target, 'w', compression=ZIP_DEFLATED) as archive:
        for name, source in files.items():
            info = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, source.read_bytes())
    return target


if __name__ == '__main__':
    print(f'Built {build().relative_to(ROOT)}')

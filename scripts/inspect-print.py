"""Inspect generated files independently of the browser layout implementation."""
import json,re,sys,unicodedata,hashlib
from pathlib import Path
import pdfplumber
from pypdf import PdfReader
root=Path('artifacts/print')
proofs=[]
for path in sorted(root.glob('*.pdf')):
    report_path=path.with_suffix('.json')
    report=json.loads(report_path.read_text()) if report_path.exists() else None
    reader=PdfReader(path)
    assert not reader.is_encrypted, f'{path}: encrypted'
    assert len(reader.pages)%2==0, f'{path}: odd final page count'
    embedded=set()
    for n,page in enumerate(reader.pages,1):
        assert abs(float(page.mediabox.width)-432)<.01 and abs(float(page.mediabox.height)-648)<.01, f'{path}: bad geometry {n}'
        assert abs(float(page.trimbox.width)-432)<.01 and abs(float(page.trimbox.height)-648)<.01
        resources=page.get('/Resources',{})
        resources=resources.get_object() if hasattr(resources,'get_object') else resources
        for name,font in resources.get('/Font',{}).items():
            font=font.get_object()
            descendants=font.get('/DescendantFonts')
            descriptor=(descendants[0].get_object() if descendants else font).get('/FontDescriptor')
            assert descriptor is not None,f'{path}: missing font descriptor'
            descriptor=descriptor.get_object()
            assert any(k in descriptor for k in ['/FontFile','/FontFile2','/FontFile3']),f'{path}: unembedded font'
            assert '/ToUnicode' in font, f'{path}: missing text map'
            embedded.add(str(font.get('/BaseFont')))
    assert embedded,f'{path}: no fonts found'
    if report:
        assert hashlib.sha256(path.read_bytes()).hexdigest()==report["artifactChecksum"],f"{path}: checksum mismatch"
        assert len(reader.pages)==report['pageCount']
        assert report['checks']['overflow']==0 and report['checks']['splitViolations']==0
        assert all(p['page']%2==1 for p in report['pages'] if p['kind']=='chapter')
    body=[]
    with pdfplumber.open(path) as document:
        for n,page in enumerate(document.pages,1):
            kind=report['pages'][n-1]['kind'] if report else None
            if kind=='blank':
                assert not page.chars, f'{path}: nonempty intentional blank {n}'
                page.close();continue
            left=54 if n%2 else 40.5;right=432-(40.5 if n%2 else 54)
            chars=page.chars
            for c in chars:
                assert c['x0']>=-.2 and c['x1']<=432.2 and c['top']>=-.2 and c['bottom']<=648.2, f'{path}: page clipping {n}'
                if c['top']>=54 and c['bottom']<=594:
                    assert c['x0']>=left-.2 and c['x1']<=right+.2, f'{path}: content margin overflow {n}'
            if kind not in ('title','blank'):
                cropped=page.crop((left-.2,54,right+.2,594))
                body.append(cropped.extract_text(x_tolerance=1,y_tolerance=3) or '')
            if report:
                top=''.join(c['text'] for c in chars if c['bottom']<54)
                foot=''.join(c['text'] for c in chars if c['top']>594)
                if kind in ('title','chapter'): assert not top, f'{path}: unexpected running header {n}'
                if kind in ('chapter','body'):
                    # Folios may restart after front matter and need not equal the physical PDF page index.
                    expected_folio=report['pages'][n-1].get('footer')
                    if expected_folio is not None:
                        assert foot.strip()==str(expected_folio), f'{path}: incorrect folio on page {n}; expected {expected_folio!r}, got {foot!r}'
                    else:
                        assert not foot.strip(), f'{path}: unexpected folio on page {n}'
                if kind=='body': assert top, f'{path}: missing running header {n}'
            page.close()
    source_path=path.with_name(path.stem+'-source.json')
    if source_path.exists():
        source=json.loads(source_path.read_text())
        expected=[]
        for chapter in source['chapters']:
            expected.append(chapter['title'])
            for node in chapter['content'].get('content',[]):
                if node['type']=='scene_break': expected.append('* * *')
                else: expected.extend(x.get('text','') for x in node.get('content',[]))
        normal=lambda s: re.sub(r'\s+','',unicodedata.normalize('NFKC',s))
        assert normal(''.join(body))==normal(''.join(expected)), f'{path}: body text changed or missing'
    proofs.append({'file':path.name,'pages':len(reader.pages),'size':[432,648],'embeddedFonts':len(embedded),'geometry':'passed','clipping':'passed','textRetention':'passed' if source_path.exists() else 'not-compared'})
    print(json.dumps(proofs[-1]),flush=True)
root.joinpath('inspection.json').write_text(json.dumps(proofs,indent=2))

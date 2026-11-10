#!/usr/bin/env python3
"""Bounded public GET diagnostics. No account, cookies, secrets or protected book requests."""
import hashlib
import json
import os
import re
import urllib.error
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
from pathlib import Path

ORIGIN = 'https://cnizroman.github.io'
SITE = ORIGIN + '/Ink/'
XML_URL = SITE + 'sitemap.xml'
NS = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
AGENTS = {
    'ordinary_request': 'Ink-Sitemap-Diagnostic/1.0',
    'googlebot_user_agent_only': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
}


def inspect(url, agent):
    redirects = []

    class Redirects(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, request, fp, code, message, headers, new_url):
            if not new_url.startswith(ORIGIN + '/'):
                raise ValueError('Unexpected cross-origin redirect')
            redirects.append({'status': code, 'to': new_url})
            return super().redirect_request(request, fp, code, message, headers, new_url)

    result = {'url': url, 'redirects': redirects}
    try:
        opener = urllib.request.build_opener(Redirects())
        request = urllib.request.Request(url, headers={'User-Agent': agent, 'Accept': '*/*', 'Accept-Encoding': 'identity'})
        try:
            response = opener.open(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            body = response.read(2_000_001)
            if len(body) > 2_000_000:
                raise ValueError('Response exceeds diagnostic size limit')
            result.update(status=response.code, final_url=response.geturl(), bytes=len(body), sha256=hashlib.sha256(body).hexdigest())
            result['headers'] = {name: response.headers[name] for name in (
                'Content-Type', 'Content-Encoding', 'Content-Length', 'Cache-Control', 'X-Robots-Tag',
                'Location', 'Last-Modified', 'ETag', 'Server', 'Vary', 'Age', 'Retry-After',
            ) if name in response.headers}
        text = body.decode('utf-8-sig')
        if url == XML_URL:
            root = ET.fromstring(text)
            if root.tag != NS + 'urlset':
                raise ValueError('Not a sitemap urlset')
            urls = [item.findtext(NS + 'loc') for item in root.findall(NS + 'url')]
            valid = bool(urls) and len(set(urls)) == len(urls) and all(
                value and value.startswith(SITE) and 'book3' not in value and '/assets/' not in value for value in urls
            )
            result.update(xml_valid=True, url_count=len(urls), public_ink_urls_only=valid,
                          matches_repository=body == Path('sitemap.xml').read_bytes())
        elif url.endswith('/robots.txt'):
            robots = urllib.robotparser.RobotFileParser()
            robots.parse(text.splitlines())
            result.update(googlebot_can_fetch_home=robots.can_fetch('Googlebot', SITE),
                          googlebot_can_fetch_sitemap=robots.can_fetch('Googlebot', XML_URL),
                          sitemap_declared=XML_URL in (robots.site_maps() or []))
        else:
            result['canonical'] = re.findall(r'<link\b[^>]*rel=["\']canonical["\'][^>]*href=["\']([^"\']+)', text, re.I)
            result['robots_meta'] = re.findall(r'<meta\b[^>]*name=["\']robots["\'][^>]*content=["\']([^"\']+)', text, re.I)
            result['google_verification_present'] = bool(re.search(r'<meta\b[^>]*name=["\']google-site-verification["\']', text, re.I))
    except (OSError, ValueError, ET.ParseError) as error:
        result['error'] = str(error)[:350]
    return result


def main():
    report = {
        'scope': 'Anonymous observations from a GitHub-hosted runner, NOT a request from Google infrastructure or a Search Console result.',
        'requests': [],
    }
    for name, agent in AGENTS.items():
        for url in (XML_URL, ORIGIN + '/robots.txt', SITE):
            result = inspect(url, agent)
            result['agent_label'] = name
            report['requests'].append(result)
    report['http_checks_passed'] = all(
        item.get('status') == 200 and not item.get('error') for item in report['requests']
    )
    report['xml_checks_passed'] = all(
        item.get('xml_valid') and item.get('public_ink_urls_only') and item.get('matches_repository')
        for item in report['requests'] if item['url'] == XML_URL
    )
    report['robots_checks_passed'] = all(
        item.get('googlebot_can_fetch_home') and item.get('googlebot_can_fetch_sitemap')
        for item in report['requests'] if item['url'].endswith('/robots.txt')
    )
    output = json.dumps(report, ensure_ascii=False, indent=2)
    Path('.cache').mkdir(exist_ok=True)
    Path('.cache/sitemap-http-report.json').write_text(output + '\n')
    print(output)
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        notice = json.dumps(report, ensure_ascii=False, separators=(',', ':'))
        notice = notice.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print('::notice title=Sitemap HTTP observations::' + notice)
    return 0 if all(report[key] for key in ('http_checks_passed', 'xml_checks_passed', 'robots_checks_passed')) else 1


if __name__ == '__main__':
    raise SystemExit(main())

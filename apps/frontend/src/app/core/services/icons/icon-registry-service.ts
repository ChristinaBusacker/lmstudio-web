import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Observable, of, map, shareReplay } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class IconRegistryService {
  private cache = new Map<string, string>();

  constructor(private http: HttpClient, private sanitizer: DomSanitizer) {}

  load(name: string): Observable<string> {
    if (this.cache.has(name)) {
      return of(this.cache.get(name)!);
    }

    return this.http.get(`/icons/${name}.svg`, { responseType: 'text' }).pipe(
      map((svg) => {
        const safe = this.sanitizer.bypassSecurityTrustHtml(svg) as string;
        this.cache.set(name, safe);
        return safe;
      }),
      shareReplay(1)
    );
  }
}

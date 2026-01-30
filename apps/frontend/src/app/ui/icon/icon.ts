/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Component, Input } from '@angular/core';
import { Observable } from 'rxjs';
import { CommonModule } from '@angular/common';
import { IconRegistryService } from '../../core/services/icons/icon-registry-service';

@Component({
  selector: 'app-icon',
  imports: [CommonModule],
  templateUrl: './icon.html',
  styleUrl: './icon.scss',
})
export class Icon {
  @Input() name!: string;
  svg$!: Observable<string>;

  @Input() size = 16;

  constructor(private icons: IconRegistryService) {}

  ngOnInit() {
    this.svg$ = this.icons.load(this.name);
  }
}

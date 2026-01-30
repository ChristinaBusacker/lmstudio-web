import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModelsPanel } from './models-panel';

describe('ModelsPanel', () => {
  let component: ModelsPanel;
  let fixture: ComponentFixture<ModelsPanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelsPanel]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ModelsPanel);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Composer } from './composer';

describe('Composer', () => {
  let component: Composer;
  let fixture: ComponentFixture<Composer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Composer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Composer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

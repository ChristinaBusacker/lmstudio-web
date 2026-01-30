import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CubeInput } from './cube-input';

describe('CubeInput', () => {
  let component: CubeInput;
  let fixture: ComponentFixture<CubeInput>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CubeInput]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CubeInput);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
